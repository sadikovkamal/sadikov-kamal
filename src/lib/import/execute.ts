import "server-only";

import { db } from "@/db";
import {
  problems,
  problemTopics,
  problemClasses,
  images,
  sources,
  topics,
} from "@/db/schema";
import { uploadFile } from "@/lib/storage/r2";
import { nextTopicCode } from "@/lib/taxonomy/topic-codes";
import type { ParsedBundle } from "./parse";
import type { ValidationReport } from "./validate";

export interface ExecuteErrorEntry {
  index: number;
  sourcePath: string;
  error: string;
}

export interface ExecuteResult {
  successCount: number;
  totalCount: number;
  errorLog: ExecuteErrorEntry[];
}

/**
 * Execute an already-validated import.
 *
 * Order of operations:
 *  1. Auto-create missing sources and topics in two bulk inserts (idempotent).
 *  2. Upload every image once to R2 under `imports/{timestamp}/`. We cache
 *     the public URL by filename so multiple problems referencing the same
 *     image only upload once.
 *  3. For each problem with status !== "error" and not duplicate, run a
 *     transaction: insert problems row, junction rows, image rows. Rewrite
 *     `images/foo.png` markdown refs to the R2 public URL inside `body_md`.
 *     Solutions are intentionally not imported (admins add them in the UI),
 *     so `solution_md` is stored as null on every imported row.
 *
 * Batch history was removed: we don't persist a row for this operation,
 * the caller just gets back the counts + per-problem error list. Orphan
 * images (uploaded but their owning problem failed to insert) stay in R2
 * — a future cleanup pass can sweep them.
 */
export async function executeImport(params: {
  bundle: ParsedBundle;
  validation: ValidationReport;
  uploadedBy: string;
}): Promise<ExecuteResult> {
  const { bundle, validation, uploadedBy } = params;
  const errorLog: ExecuteErrorEntry[] = [];
  let successCount = 0;

  // 1. Auto-create missing sources/topics.
  const allNewSources = uniq(validation.problems.flatMap((p) => p.newSources));
  if (allNewSources.length) {
    await db
      .insert(sources)
      .values(
        allNewSources.map((slug) => ({ name: slugToName(slug), slug }))
      )
      .onConflictDoNothing({ target: sources.slug });
  }

  const allNewTopics = uniq(validation.problems.flatMap((p) => p.newTopics));
  if (allNewTopics.length) {
    // Auto-assign sequential codes (T######) — read max once, increment
    // locally per new topic. onConflictDoNothing handles the race with
    // duplicate names cleanly; for code collisions we'd hit the UNIQUE
    // constraint, which is acceptable for the import path (admin retries).
    const existing = await db.select({ code: topics.code }).from(topics);
    const allCodes = existing.map((r) => r.code);
    const values = allNewTopics.map((name) => {
      const code = nextTopicCode(allCodes);
      allCodes.push(code);
      return { name, code };
    });
    // Conflict on code (only unique column on topics). Race-protection
    // for two parallel imports trying to grab the same T-code at once.
    await db
      .insert(topics)
      .values(values)
      .onConflictDoNothing({ target: topics.code });
  }

  // Re-read after the inserts so the lookup maps are complete. Topics
  // match by case-insensitive name (lowercased keys) since the slug
  // column is gone; sources still match by slug.
  const [allSources, allTopics] = await Promise.all([
    db.select({ id: sources.id, slug: sources.slug }).from(sources),
    db.select({ id: topics.id, name: topics.name }).from(topics),
  ]);
  const sourceIdBySlug = new Map(allSources.map((r) => [r.slug, r.id]));
  const topicIdByName = new Map(
    allTopics.map((r) => [r.name.toLowerCase(), r.id])
  );

  // 2. Upload all images once. Prefix is a timestamp folder under
  // `imports/` — random enough to avoid collisions and easy to spot in R2.
  const uploadPrefix = `imports/${Date.now()}`;
  interface UploadedImage {
    storageKey: string;
    publicUrl: string;
    sizeBytes: number;
    mimeType: string;
    originalFilename: string;
  }
  const imageUrlByFilename = new Map<string, UploadedImage>();

  for (const [filename, bytes] of bundle.images) {
    try {
      const mimeType = guessMimeType(filename);
      const uploaded = await uploadFile({
        file: bytes,
        mimeType,
        originalFilename: filename,
        prefix: uploadPrefix,
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

  // 3. Insert each valid, non-duplicate problem in its own transaction.
  for (const v of validation.problems) {
    if (v.status === "error" || !v.frontmatter) {
      errorLog.push({
        index: v.index,
        sourcePath: v.sourcePath,
        error: v.errors.join("; ") || "Validation error",
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

    const parsed = bundle.problems.find((p) => p.index === v.index);
    if (!parsed) {
      errorLog.push({
        index: v.index,
        sourcePath: v.sourcePath,
        error: "Internal: parsed problem missing for validation entry",
      });
      continue;
    }
    const fm = v.frontmatter;

    // Rewrite `images/foo.png` refs in markdown to absolute R2 URLs.
    const rewrite = (md: string | null): string | null => {
      if (md == null) return null;
      return md.replace(
        /!\[([^\]]*)\]\(images\/([^)]+)\)/g,
        (_, alt: string, ref: string) => {
          const img = imageUrlByFilename.get(ref);
          return img
            ? `![${alt}](${img.publicUrl})`
            : `![${alt}](images/${ref})`;
        }
      );
    };

    try {
      await db.transaction(async (tx) => {
        const sourceId = sourceIdBySlug.get(fm.source);
        if (!sourceId) throw new Error(`Source slug not found: ${fm.source}`);

        const topicIds = fm.topics
          .map((t) => topicIdByName.get(t.toLowerCase()))
          .filter((id): id is string => typeof id === "string");
        if (topicIds.length === 0) {
          throw new Error("No valid topic IDs for this problem");
        }

        const [createdProblem] = await tx
          .insert(problems)
          .values({
            bodyMd: rewrite(parsed.bodyMd) ?? "",
            // Import never carries solutions — admins add them in the UI.
            solutionMd: null,
            answer: fm.answer ?? null,
            sourceId,
            year: fm.year ?? null,
            problemNumber: fm.problem_number ?? null,
            createdBy: uploadedBy,
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

        // Persist image rows for the images this problem references.
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

  return {
    successCount,
    totalCount: validation.problems.length,
    errorLog,
  };
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function slugToName(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w.length === 0 ? "" : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

function guessMimeType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
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
