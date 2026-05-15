# Phase 8 — Bulk Import Implementation

**Goal:** Build the actual bulk importer. Upload a ZIP, parse it according
to the format spec from Phase 7, validate it, show a preview with errors,
then execute the import — uploading images to R2 and inserting problems
transactionally with full audit trail.

**Estimated time:** 2 sessions (~6-8 hours)

---

## What you'll have at the end

- `/admin/import` — upload page with drag-drop ZIP support
- `/admin/import/[batchId]` — preview + status page
- ZIP parsing pipeline: extract → split into problems → parse frontmatter
  → validate against Zod schema → check image references
- Preview UI showing all parsed problems with per-problem validation status
- "Execute import" action that:
  - Creates an `import_batches` row
  - Uploads images to R2 under `batches/{batchId}/`
  - Rewrites image refs in markdown to public URLs
  - Inserts problems transactionally
  - Auto-creates missing sources / topics / tags by slug
  - Skips duplicates (same source + year + problem_number) with a warning
  - Updates batch status with success/error counts and an error log
- Status page that shows finished batch with link to imported problems

---

## Architecture

The flow is split into three stages so each is independently testable:

1. **Parse** — pure function, ZIP bytes → structured `ParsedBundle`
2. **Validate** — pure function, `ParsedBundle` + DB lookups → `ValidationReport`
3. **Execute** — side effects, validated bundle → DB rows + R2 uploads

This separation means the preview UI just runs Parse + Validate (no writes),
and clicking "Execute" runs all three.

---

## Steps

### 8.1. Install parsing deps

```bash
npm install jszip gray-matter js-yaml
npm install -D @types/js-yaml
```

### 8.2. The Zod schema for frontmatter

Create `src/lib/import/schema.ts`:

```typescript
import { z } from "zod";

export const problemFrontmatterSchema = z.object({
  source: z.string().min(1).max(100),
  source_name: z.string().optional(), // optional display name when auto-creating
  year: z.number().int().min(1900).max(2100).optional(),
  problem_number: z
    .union([z.string(), z.number()])
    .transform((v) => String(v))
    .optional(),
  classes: z.array(z.number().int().min(5).max(11)).min(1),
  topics: z.array(z.string().min(1)).min(1),
  topic_names: z.record(z.string()).optional(),
  difficulty: z.number().int().min(1).max(5),
  tags: z.array(z.string()).default([]),
  answer: z.string().optional(),
});

export type ProblemFrontmatter = z.infer<typeof problemFrontmatterSchema>;

export const manifestSchema = z.object({
  format_version: z.literal(1).optional(),
  batch_name: z.string().optional(),
  defaults: z
    .object({
      source: z.string().optional(),
      year: z.number().int().optional(),
      classes: z.array(z.number().int()).optional(),
      topics: z.array(z.string()).optional(),
      difficulty: z.number().int().optional(),
      tags: z.array(z.string()).optional(),
    })
    .partial()
    .optional(),
});

export type Manifest = z.infer<typeof manifestSchema>;
```

### 8.3. The parser

Create `src/lib/import/parse.ts`:

```typescript
import JSZip from "jszip";
import matter from "gray-matter";
import yaml from "js-yaml";
import { manifestSchema, type Manifest } from "./schema";

export interface ParsedProblem {
  /** 1-indexed position in the batch, used in error reporting */
  index: number;
  /** Filename it came from, e.g. "problems.md (block 3)" or "problems/p001.md" */
  sourcePath: string;
  rawFrontmatter: unknown;
  bodyMd: string;
  solutionMd: string | null;
  /** Image filenames referenced in the body, relative to images/ */
  imageRefs: string[];
}

export interface ParsedBundle {
  manifest: Manifest | null;
  problems: ParsedProblem[];
  /** All entries under images/ that were found in the ZIP */
  images: Map<string, Uint8Array>;
  /** Errors at the bundle level, before per-problem validation */
  bundleErrors: string[];
}

const MAX_BUNDLE_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_PROBLEMS = 200;

export async function parseBundle(zipBytes: Uint8Array): Promise<ParsedBundle> {
  const bundleErrors: string[] = [];

  if (zipBytes.byteLength > MAX_BUNDLE_SIZE) {
    return {
      manifest: null,
      problems: [],
      images: new Map(),
      bundleErrors: [`Bundle exceeds 50 MB limit`],
    };
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBytes);
  } catch (e) {
    return {
      manifest: null,
      problems: [],
      images: new Map(),
      bundleErrors: [`Cannot open ZIP: ${e instanceof Error ? e.message : "unknown"}`],
    };
  }

  // 1. Manifest (optional)
  let manifest: Manifest | null = null;
  const manifestFile = zip.file("manifest.yaml") || zip.file("manifest.yml");
  if (manifestFile) {
    try {
      const text = await manifestFile.async("string");
      const parsed = manifestSchema.safeParse(yaml.load(text));
      if (parsed.success) manifest = parsed.data;
      else bundleErrors.push(`manifest.yaml invalid: ${parsed.error.issues[0].message}`);
    } catch (e) {
      bundleErrors.push(`manifest.yaml unreadable: ${String(e)}`);
    }
  }

  // 2. Images
  const images = new Map<string, Uint8Array>();
  const imageEntries = zip.file(/^images\/[^/]+$/);
  for (const entry of imageEntries) {
    const filename = entry.name.replace(/^images\//, "");
    images.set(filename, await entry.async("uint8array"));
  }

  // 3. Problems — try problems.md first, then problems/*.md
  const problems: ParsedProblem[] = [];
  const singleFile = zip.file("problems.md");
  if (singleFile) {
    const text = await singleFile.async("string");
    const blocks = splitProblemBlocks(text);
    blocks.forEach((block, i) => {
      const parsed = parseProblemMarkdown(block, `problems.md (block ${i + 1})`, i + 1);
      if (parsed) problems.push(parsed);
    });
  } else {
    const dirEntries = zip.file(/^problems\/[^/]+\.md$/);
    if (dirEntries.length === 0) {
      bundleErrors.push(
        `Bundle must contain either problems.md or problems/*.md`
      );
    }
    const sortedEntries = dirEntries.sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    for (let i = 0; i < sortedEntries.length; i++) {
      const text = await sortedEntries[i].async("string");
      const parsed = parseProblemMarkdown(text, sortedEntries[i].name, i + 1);
      if (parsed) problems.push(parsed);
    }
  }

  if (problems.length > MAX_PROBLEMS) {
    bundleErrors.push(
      `Bundle has ${problems.length} problems, max is ${MAX_PROBLEMS}`
    );
  }

  return { manifest, problems, images, bundleErrors };
}

function splitProblemBlocks(text: string): string[] {
  // Split on lines that are exactly "---" surrounded by blank lines.
  // We can't just split on "---" because frontmatter uses it too.
  // Strategy: find frontmatter start positions and split there.
  const blocks: string[] = [];
  const lines = text.split(/\r?\n/);
  let current: string[] = [];
  let inFrontmatter = false;
  let sawFrontmatterStart = false;

  for (const line of lines) {
    if (line.trim() === "---") {
      if (!inFrontmatter && !sawFrontmatterStart) {
        // Start of a new problem's frontmatter
        if (current.length && current.some((l) => l.trim())) {
          blocks.push(current.join("\n"));
        }
        current = [line];
        inFrontmatter = true;
        sawFrontmatterStart = true;
      } else if (inFrontmatter) {
        // End of frontmatter
        current.push(line);
        inFrontmatter = false;
      } else {
        // Separator between problems (after a body)
        if (current.length) blocks.push(current.join("\n"));
        current = [];
        sawFrontmatterStart = false;
      }
    } else {
      current.push(line);
    }
  }

  if (current.length && current.some((l) => l.trim())) {
    blocks.push(current.join("\n"));
  }

  return blocks;
}

function parseProblemMarkdown(
  text: string,
  sourcePath: string,
  index: number
): ParsedProblem | null {
  let parsed;
  try {
    parsed = matter(text);
  } catch {
    return {
      index,
      sourcePath,
      rawFrontmatter: null,
      bodyMd: text,
      solutionMd: null,
      imageRefs: [],
    };
  }

  const { bodyMd, solutionMd } = splitBodyAndSolution(parsed.content);
  const imageRefs = extractImageRefs(parsed.content);

  return {
    index,
    sourcePath,
    rawFrontmatter: parsed.data,
    bodyMd,
    solutionMd,
    imageRefs,
  };
}

function splitBodyAndSolution(content: string): {
  bodyMd: string;
  solutionMd: string | null;
} {
  // Find "# Shart" and "# Yechim" top-level headings
  const lines = content.split(/\r?\n/);
  let shartStart = -1;
  let yechimStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^#\s+Shart\b/i.test(line)) shartStart = i;
    else if (/^#\s+(Yechim|Solution)\b/i.test(line)) yechimStart = i;
  }

  if (shartStart === -1) {
    // No Shart heading — treat the whole content as body
    return { bodyMd: content.trim(), solutionMd: null };
  }

  const bodyEnd = yechimStart === -1 ? lines.length : yechimStart;
  const bodyMd = lines.slice(shartStart + 1, bodyEnd).join("\n").trim();
  const solutionMd =
    yechimStart === -1
      ? null
      : lines.slice(yechimStart + 1).join("\n").trim();

  return { bodyMd, solutionMd: solutionMd || null };
}

function extractImageRefs(content: string): string[] {
  const refs: string[] = [];
  const regex = /!\[[^\]]*\]\(images\/([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content))) refs.push(m[1]);
  return refs;
}
```

### 8.4. The validator

Create `src/lib/import/validate.ts`:

```typescript
import { db } from "@/db";
import { sources, topics, problems } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  problemFrontmatterSchema,
  type ProblemFrontmatter,
  type Manifest,
} from "./schema";
import type { ParsedBundle, ParsedProblem } from "./parse";

export interface ProblemValidation {
  index: number;
  sourcePath: string;
  status: "ok" | "warning" | "error";
  frontmatter: ProblemFrontmatter | null;
  errors: string[];
  warnings: string[];
  /** True if a duplicate already exists in the DB */
  isDuplicate: boolean;
  /** Slugs of sources/topics that don't exist yet (will be auto-created) */
  newSources: string[];
  newTopics: string[];
}

export interface ValidationReport {
  bundleErrors: string[];
  problems: ProblemValidation[];
  okCount: number;
  errorCount: number;
  warningCount: number;
}

export async function validateBundle(
  bundle: ParsedBundle
): Promise<ValidationReport> {
  const result: ProblemValidation[] = [];
  const imageNames = new Set(bundle.images.keys());

  // Pre-fetch lookups
  const allSources = await db.select({ slug: sources.slug }).from(sources);
  const allTopics = await db.select({ slug: topics.slug }).from(topics);
  const sourceSlugs = new Set(allSources.map((r) => r.slug));
  const topicSlugs = new Set(allTopics.map((r) => r.slug));

  for (const p of bundle.problems) {
    const v = await validateProblem(
      p,
      bundle.manifest,
      sourceSlugs,
      topicSlugs,
      imageNames
    );
    result.push(v);
  }

  return {
    bundleErrors: bundle.bundleErrors,
    problems: result,
    okCount: result.filter((p) => p.status === "ok").length,
    warningCount: result.filter((p) => p.status === "warning").length,
    errorCount: result.filter((p) => p.status === "error").length,
  };
}

async function validateProblem(
  parsed: ParsedProblem,
  manifest: Manifest | null,
  existingSourceSlugs: Set<string>,
  existingTopicSlugs: Set<string>,
  imageNames: Set<string>
): Promise<ProblemValidation> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const newSources: string[] = [];
  const newTopics: string[] = [];

  // Merge defaults from manifest
  const defaults = manifest?.defaults ?? {};
  const merged = { ...defaults, ...(parsed.rawFrontmatter as object) };

  // Validate against schema
  const parsedFm = problemFrontmatterSchema.safeParse(merged);
  if (!parsedFm.success) {
    return {
      index: parsed.index,
      sourcePath: parsed.sourcePath,
      status: "error",
      frontmatter: null,
      errors: parsedFm.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`
      ),
      warnings: [],
      isDuplicate: false,
      newSources: [],
      newTopics: [],
    };
  }

  const fm = parsedFm.data;

  // Body must not be empty
  if (!parsed.bodyMd.trim()) {
    errors.push("Problem body is empty (missing # Shart section?)");
  }

  // Image refs must exist
  for (const ref of parsed.imageRefs) {
    if (!imageNames.has(ref)) {
      errors.push(`Image not in bundle: images/${ref}`);
    }
  }

  // Source / topic auto-create tracking
  if (!existingSourceSlugs.has(fm.source)) {
    newSources.push(fm.source);
    warnings.push(`Source "${fm.source}" will be auto-created`);
  }
  for (const t of fm.topics) {
    if (!existingTopicSlugs.has(t)) {
      newTopics.push(t);
      warnings.push(`Topic "${t}" will be auto-created`);
    }
  }

  // Duplicate check
  let isDuplicate = false;
  if (fm.year != null && fm.problem_number != null) {
    // Look up source ID first
    const srcRow = await db.query.sources.findFirst({
      where: eq(sources.slug, fm.source),
    });
    if (srcRow) {
      const dup = await db.query.problems.findFirst({
        where: and(
          eq(problems.sourceId, srcRow.id),
          eq(problems.year, fm.year),
          eq(problems.problemNumber, fm.problem_number)
        ),
      });
      if (dup) {
        isDuplicate = true;
        warnings.push(
          `Duplicate: a problem with same source/year/number already exists. Will be skipped.`
        );
      }
    }
  }

  const status: ProblemValidation["status"] = errors.length
    ? "error"
    : warnings.length
    ? "warning"
    : "ok";

  return {
    index: parsed.index,
    sourcePath: parsed.sourcePath,
    status,
    frontmatter: fm,
    errors,
    warnings,
    isDuplicate,
    newSources,
    newTopics,
  };
}
```

### 8.5. The executor

Create `src/lib/import/execute.ts`:

```typescript
import { db } from "@/db";
import {
  problems,
  problemTopics,
  problemTags,
  problemClasses,
  images,
  sources,
  topics,
  importBatches,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { uploadFile } from "@/lib/storage/r2";
import { ensureTagsByName } from "@/lib/problems/mutations";
import type { ParsedBundle } from "./parse";
import type { ValidationReport, ProblemValidation } from "./validate";

export interface ExecuteResult {
  batchId: string;
  successCount: number;
  errorLog: Array<{ index: number; sourcePath: string; error: string }>;
}

export async function executeImport(params: {
  batchId: string;
  bundle: ParsedBundle;
  validation: ValidationReport;
  uploadedBy: string;
}): Promise<ExecuteResult> {
  const { batchId, bundle, validation, uploadedBy } = params;

  const errorLog: ExecuteResult["errorLog"] = [];
  let successCount = 0;

  // Mark batch as processing
  await db
    .update(importBatches)
    .set({ status: "processing" })
    .where(eq(importBatches.id, batchId));

  // 1. Auto-create missing sources and topics, build slug→id map
  const allNewSources = Array.from(
    new Set(validation.problems.flatMap((p) => p.newSources))
  );
  if (allNewSources.length) {
    await db
      .insert(sources)
      .values(
        allNewSources.map((slug) => ({
          name: slug.replace(/-/g, " "),
          slug,
        }))
      )
      .onConflictDoNothing({ target: sources.slug });
  }

  const allNewTopics = Array.from(
    new Set(validation.problems.flatMap((p) => p.newTopics))
  );
  if (allNewTopics.length) {
    await db
      .insert(topics)
      .values(
        allNewTopics.map((slug) => ({
          name: slug.replace(/-/g, " "),
          slug,
        }))
      )
      .onConflictDoNothing({ target: topics.slug });
  }

  const allSources = await db.select({ id: sources.id, slug: sources.slug }).from(sources);
  const allTopics = await db.select({ id: topics.id, slug: topics.slug }).from(topics);
  const sourceIdBySlug = new Map(allSources.map((r) => [r.slug, r.id]));
  const topicIdBySlug = new Map(allTopics.map((r) => [r.slug, r.id]));

  // 2. Upload all images once, build filename → public URL map
  const imageUrlByFilename = new Map<
    string,
    { storageKey: string; publicUrl: string; sizeBytes: number; mimeType: string; originalFilename: string }
  >();

  for (const [filename, bytes] of bundle.images) {
    try {
      const mimeType = guessMimeType(filename);
      const uploaded = await uploadFile({
        file: bytes,
        mimeType,
        originalFilename: filename,
        prefix: `batches/${batchId}`,
      });
      imageUrlByFilename.set(filename, {
        ...uploaded,
        originalFilename: filename,
      });
    } catch (e) {
      errorLog.push({
        index: 0,
        sourcePath: `images/${filename}`,
        error: `Image upload failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  // 3. Insert each valid, non-duplicate problem
  for (const v of validation.problems) {
    if (v.status === "error" || !v.frontmatter) {
      errorLog.push({
        index: v.index,
        sourcePath: v.sourcePath,
        error: v.errors.join("; "),
      });
      continue;
    }

    if (v.isDuplicate) {
      errorLog.push({
        index: v.index,
        sourcePath: v.sourcePath,
        error: "Skipped (duplicate)",
      });
      continue;
    }

    const parsed = bundle.problems.find((p) => p.index === v.index)!;
    const fm = v.frontmatter;

    // Rewrite image refs in body and solution to public URLs
    const rewrite = (md: string | null): string | null => {
      if (md == null) return null;
      return md.replace(
        /!\[([^\]]*)\]\(images\/([^)]+)\)/g,
        (_, alt, ref) => {
          const img = imageUrlByFilename.get(ref);
          return img ? `![${alt}](${img.publicUrl})` : `![${alt}](images/${ref})`;
        }
      );
    };

    try {
      await db.transaction(async (tx) => {
        const sourceId = sourceIdBySlug.get(fm.source);
        if (!sourceId) throw new Error(`Source slug not found: ${fm.source}`);

        const topicIds = fm.topics
          .map((t) => topicIdBySlug.get(t))
          .filter((id): id is string => !!id);
        if (topicIds.length === 0) throw new Error("No valid topics");

        const tagIds = await ensureTagsByName(fm.tags ?? []);

        const [createdProblem] = await tx
          .insert(problems)
          .values({
            bodyMd: rewrite(parsed.bodyMd) ?? "",
            solutionMd: rewrite(parsed.solutionMd),
            answer: fm.answer ?? null,
            sourceId,
            year: fm.year ?? null,
            problemNumber: fm.problem_number ?? null,
            difficulty: fm.difficulty,
            createdBy: uploadedBy,
            importBatchId: batchId,
            metadata: {},
          })
          .returning({ id: problems.id });

        await tx.insert(problemTopics).values(
          topicIds.map((topicId) => ({
            problemId: createdProblem.id,
            topicId,
          }))
        );
        await tx.insert(problemClasses).values(
          fm.classes.map((classNumber) => ({
            problemId: createdProblem.id,
            classNumber,
          }))
        );
        if (tagIds.length) {
          await tx.insert(problemTags).values(
            tagIds.map((tagId) => ({ problemId: createdProblem.id, tagId }))
          );
        }

        // Persist image rows for the images this problem references
        for (const ref of parsed.imageRefs) {
          const img = imageUrlByFilename.get(ref);
          if (!img) continue;
          await tx.insert(images).values({
            problemId: createdProblem.id,
            storageKey: img.storageKey,
            originalFilename: img.originalFilename,
            altText: null,
            sizeBytes: img.sizeBytes,
            mimeType: img.mimeType,
          });
        }
      });

      successCount++;
    } catch (e) {
      errorLog.push({
        index: v.index,
        sourcePath: v.sourcePath,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // 4. Finalize batch
  const status =
    successCount === validation.problems.length
      ? "success"
      : successCount === 0
      ? "failed"
      : "partial";

  await db
    .update(importBatches)
    .set({
      status,
      successCount,
      errorLog,
      finishedAt: new Date(),
    })
    .where(eq(importBatches.id, batchId));

  return { batchId, successCount, errorLog };
}

function guessMimeType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}
```

### 8.6. Server actions

Create `src/app/admin/import/_actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { importBatches } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { parseBundle } from "@/lib/import/parse";
import { validateBundle } from "@/lib/import/validate";
import { executeImport } from "@/lib/import/execute";

/**
 * Step 1: upload + parse + validate.
 * We persist the ZIP bytes to a staging row so the user can review before
 * committing. For MVP we keep the bytes in memory between requests by
 * storing them in the import_batches row itself? No — too heavy.
 *
 * Simpler approach: parse + validate on the server, return the report
 * directly to the client. Client holds the ZIP file in memory and uploads
 * it again on "Execute". Acceptable for files under 50 MB.
 */
export async function previewImportAction(formData: FormData) {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "No file uploaded" };
  }
  const buffer = new Uint8Array(await file.arrayBuffer());
  const bundle = await parseBundle(buffer);
  const validation = await validateBundle(bundle);

  return {
    success: true,
    filename: file.name,
    size: file.size,
    validation,
    parsedSummary: {
      problemCount: bundle.problems.length,
      imageCount: bundle.images.size,
      manifestPresent: !!bundle.manifest,
    },
  };
}

/**
 * Step 2: execute the import.
 * The client uploads the same ZIP again with the user's confirmation.
 */
export async function executeImportAction(formData: FormData) {
  const user = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "No file uploaded" };
  }
  const buffer = new Uint8Array(await file.arrayBuffer());
  const bundle = await parseBundle(buffer);
  const validation = await validateBundle(bundle);

  // Create the batch row first
  const [batch] = await db
    .insert(importBatches)
    .values({
      uploadedBy: user.id,
      filename: file.name,
      status: "pending",
      totalCount: bundle.problems.length,
    })
    .returning({ id: importBatches.id });

  // Run the import (could be moved to a background job later)
  await executeImport({
    batchId: batch.id,
    bundle,
    validation,
    uploadedBy: user.id,
  });

  revalidatePath("/admin/problems");
  revalidatePath("/admin/import");
  redirect(`/admin/import/${batch.id}`);
}
```

### 8.7. Upload + preview page

Create `src/app/admin/import/page.tsx`:

```tsx
import Link from "next/link";
import { db } from "@/db";
import { importBatches } from "@/db/schema";
import { desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { ImportUploader } from "./import-uploader";
import { Badge } from "@/components/ui/badge";

export default async function ImportPage() {
  await requireAdmin();
  const recent = await db
    .select()
    .from(importBatches)
    .orderBy(desc(importBatches.createdAt))
    .limit(10);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Bulk import</h1>
        <p className="text-muted-foreground text-sm">
          Upload a ZIP bundle of problems. See <code>docs/format-spec.md</code>
          {" "}for format.
        </p>
      </div>

      <ImportUploader />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Recent imports</h2>
        <div className="border rounded-md divide-y">
          {recent.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">
              No imports yet.
            </div>
          )}
          {recent.map((b) => (
            <Link
              key={b.id}
              href={`/admin/import/${b.id}`}
              className="block p-3 hover:bg-muted text-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{b.filename}</span>
                <Badge variant={statusVariant(b.status)}>{b.status}</Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {b.successCount} / {b.totalCount} succeeded ·{" "}
                {new Date(b.createdAt).toLocaleString()}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function statusVariant(status: string) {
  switch (status) {
    case "success": return "default" as const;
    case "partial": return "secondary" as const;
    case "failed": return "destructive" as const;
    default: return "outline" as const;
  }
}
```

Create `src/app/admin/import/import-uploader.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { previewImportAction, executeImportAction } from "./_actions";

interface PreviewResult {
  filename: string;
  parsedSummary: { problemCount: number; imageCount: number; manifestPresent: boolean };
  validation: {
    bundleErrors: string[];
    okCount: number;
    warningCount: number;
    errorCount: number;
    problems: Array<{
      index: number;
      sourcePath: string;
      status: "ok" | "warning" | "error";
      errors: string[];
      warnings: string[];
      isDuplicate: boolean;
    }>;
  };
}

export function ImportUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onPreview() {
    if (!file) return;
    setIsLoading(true);
    setError(null);
    setPreview(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await previewImportAction(fd);
      if ("error" in res && res.error) setError(res.error);
      else if ("success" in res) setPreview(res as PreviewResult);
    } finally {
      setIsLoading(false);
    }
  }

  async function onExecute() {
    if (!file) return;
    setIsLoading(true);
    const fd = new FormData();
    fd.append("file", file);
    await executeImportAction(fd);
    // executeImportAction redirects on success
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="zip">Bundle ZIP</Label>
        <Input
          id="zip"
          type="file"
          accept=".zip,application/zip"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
            setError(null);
          }}
        />
      </div>

      <div className="flex gap-2">
        <Button onClick={onPreview} disabled={!file || isLoading}>
          {isLoading ? "Validating..." : "Preview"}
        </Button>
        {preview && preview.validation.errorCount === 0 && (
          <Button
            variant="default"
            onClick={onExecute}
            disabled={isLoading}
          >
            {isLoading ? "Importing..." : `Import ${preview.parsedSummary.problemCount} problems`}
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {preview && (
        <div className="border rounded-md p-4 space-y-3">
          <div className="flex gap-3">
            <Badge variant="outline">{preview.parsedSummary.problemCount} problems</Badge>
            <Badge variant="outline">{preview.parsedSummary.imageCount} images</Badge>
            {preview.parsedSummary.manifestPresent && (
              <Badge variant="outline">manifest.yaml present</Badge>
            )}
            <Badge variant="default">{preview.validation.okCount} OK</Badge>
            {preview.validation.warningCount > 0 && (
              <Badge variant="secondary">
                {preview.validation.warningCount} warnings
              </Badge>
            )}
            {preview.validation.errorCount > 0 && (
              <Badge variant="destructive">
                {preview.validation.errorCount} errors
              </Badge>
            )}
          </div>

          {preview.validation.bundleErrors.length > 0 && (
            <div className="text-sm text-destructive">
              <strong>Bundle errors:</strong>
              <ul className="list-disc ml-5">
                {preview.validation.bundleErrors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-1 max-h-96 overflow-auto">
            {preview.validation.problems.map((p) => (
              <div
                key={p.index}
                className={`border rounded p-2 text-xs ${
                  p.status === "error"
                    ? "border-destructive/50 bg-destructive/5"
                    : p.status === "warning"
                    ? "border-amber-500/50 bg-amber-500/5"
                    : "border-border"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      p.status === "error"
                        ? "destructive"
                        : p.status === "warning"
                        ? "secondary"
                        : "default"
                    }
                  >
                    {p.status}
                  </Badge>
                  <span className="font-mono">{p.sourcePath}</span>
                  {p.isDuplicate && (
                    <Badge variant="outline">duplicate (will skip)</Badge>
                  )}
                </div>
                {p.errors.map((e, i) => (
                  <div key={i} className="text-destructive mt-1">• {e}</div>
                ))}
                {p.warnings.map((w, i) => (
                  <div key={i} className="text-amber-700 mt-1">• {w}</div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

### 8.8. Batch detail / status page

Create `src/app/admin/import/[batchId]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { importBatches, problems, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  await requireAdmin();
  const { batchId } = await params;

  const batch = await db.query.importBatches.findFirst({
    where: eq(importBatches.id, batchId),
  });
  if (!batch) notFound();

  const uploader = await db.query.users.findFirst({
    where: eq(users.id, batch.uploadedBy),
  });

  const importedProblems = await db
    .select({
      id: problems.id,
      sourceId: problems.sourceId,
      year: problems.year,
      problemNumber: problems.problemNumber,
    })
    .from(problems)
    .where(eq(problems.importBatchId, batchId))
    .orderBy(desc(problems.createdAt));

  const errorLog = (batch.errorLog as Array<{
    index: number;
    sourcePath: string;
    error: string;
  }>) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{batch.filename}</h1>
        <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
          <Badge variant={
            batch.status === "success" ? "default" :
            batch.status === "partial" ? "secondary" :
            batch.status === "failed" ? "destructive" : "outline"
          }>
            {batch.status}
          </Badge>
          <span>{batch.successCount} / {batch.totalCount} succeeded</span>
          <span>·</span>
          <span>{uploader?.fullName ?? "?"}</span>
          <span>·</span>
          <span>{new Date(batch.createdAt).toLocaleString()}</span>
        </div>
      </div>

      {errorLog.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-2">Errors / skips</h2>
          <div className="border rounded-md divide-y text-xs">
            {errorLog.map((e, i) => (
              <div key={i} className="p-2">
                <span className="font-mono">{e.sourcePath}</span>
                <span className="text-destructive ml-2">{e.error}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-2">
          Imported problems ({importedProblems.length})
        </h2>
        <div className="border rounded-md divide-y">
          {importedProblems.map((p) => (
            <Link
              key={p.id}
              href={`/admin/problems/${p.id}`}
              className="block p-2 hover:bg-muted text-sm"
            >
              {p.year ?? "?"} · {p.problemNumber ?? ""}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
```

### 8.9. Add nav link

In `src/app/admin/layout.tsx`, add:

```tsx
<Link href="/admin/import" className="text-sm">Import</Link>
```

### 8.10. Test with the sample bundle

1. Log in to `/admin`
2. Go to `/admin/import`
3. Upload `docs/examples/sample-batch.zip` from Phase 7
4. Click "Preview" — should show 3 problems, 2 images, all OK or with
   minimal warnings
5. Click "Import 3 problems" — should redirect to the batch detail page
   showing 3 successes
6. Go to `/admin/problems` — the 3 imported problems are listed
7. Click into one — body, solution, images all render correctly

### 8.11. Test the failure cases

Create a broken bundle to verify error handling:
- Frontmatter with `difficulty: 7` (out of range)
- Missing `# Shart` heading
- Image reference to a file not in `images/`
- Re-upload the sample bundle (everything should be flagged as duplicate)

---

## File structure changes

```
src/
├── lib/
│   └── import/
│       ├── schema.ts                       (new)
│       ├── parse.ts                        (new)
│       ├── validate.ts                     (new)
│       └── execute.ts                      (new)
└── app/
    └── admin/
        ├── layout.tsx                      (modified — nav link)
        └── import/
            ├── page.tsx                    (new — upload + recent batches)
            ├── import-uploader.tsx         (new — client component)
            ├── _actions.ts                 (new)
            └── [batchId]/
                └── page.tsx                (new — batch detail)
```

---

## Acceptance criteria

- [ ] `/admin/import` loads, shows the upload form and recent batches list
- [ ] Uploading the Phase 7 sample bundle and clicking Preview shows
      3 OK problems with 2 images
- [ ] Clicking Import creates a batch row, uploads images to R2 under
      `batches/{batchId}/`, inserts 3 problems, redirects to batch page
- [ ] Batch page shows `success` status with 3/3 succeeded
- [ ] All 3 imported problems appear in `/admin/problems` and their image
      URLs resolve to R2
- [ ] In `psql`, `SELECT * FROM problems WHERE import_batch_id = '...';`
      returns the 3 rows
- [ ] Re-uploading the same bundle shows all 3 as duplicate warnings,
      Import skips them and reports a partial result
- [ ] Bundle with frontmatter validation errors blocks the Import button
- [ ] Bundle with missing image reference shows error per-problem
- [ ] Batch with all errors saves with `failed` status, no problems inserted

---

## Common pitfalls

- **`splitProblemBlocks` over-splitting** — frontmatter delimiters (`---`)
  inside a problem can confuse a naive split. The implementation tracks
  whether we're in a frontmatter block. Test with the sample bundle which
  has 3 problems.
- **Hashing file bytes vs streaming** — for 50 MB ZIPs we read into memory.
  Vercel functions have a payload limit (~4.5 MB by default for server
  actions). To accept larger bundles, you'll need a presigned R2 upload
  flow. For MVP, document the 4.5 MB practical limit on the upload page.
- **Image upload before transaction** — we upload all images **before**
  inserting any problem rows. If the user aborts mid-import or one problem
  fails, the orphan images stay in R2. Acceptable for MVP. Cleanup pass
  in Phase 10.
- **`onConflictDoNothing` after `executeImport`** — auto-creating sources
  with conflict-do-nothing means if two batches race to create the same
  source slug, one wins. Fine, since the slug-only auto-create is
  idempotent.
- **Reading the file twice** — the client uploads the same ZIP for preview
  and for execute. We accept the duplicated work as the simplest UX. If it
  becomes a problem (very large bundles), stage the file in R2 between
  steps.
- **Server action 4.5 MB limit** — if your bundle is over this, the server
  action returns an error. Document this and recommend smaller batches
  (split your PDF into 50-problem chunks).

---

## What's next

→ [Phase 9 — Taxonomy CRUD and Dashboard](./phase-09-taxonomy-crud-and-dashboard.md)
