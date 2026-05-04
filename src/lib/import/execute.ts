import "server-only";

import { eq } from "drizzle-orm";
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
import { uploadFile } from "@/lib/storage/r2";
import { ensureTagsByName } from "@/lib/problems/mutations";
import type { ParsedBundle } from "./parse";
import type { ValidationReport } from "./validate";

export interface ExecuteErrorEntry {
  index: number;
  sourcePath: string;
  error: string;
}

export interface ExecuteResult {
  batchId: string;
  successCount: number;
  totalCount: number;
  errorLog: ExecuteErrorEntry[];
  status: "success" | "partial" | "failed";
}

/**
 * Execute an already-validated import.
 *
 * Order of operations:
 *  1. Mark the batch row as `processing`.
 *  2. Auto-create missing sources and topics in two bulk inserts (idempotent).
 *  3. Upload every image once to R2 under `batches/{batchId}/`. We cache
 *     the public URL by filename so multiple problems referencing the same
 *     image only upload once.
 *  4. For each problem with status !== "error" and not duplicate, run a
 *     transaction: insert problems row, junction rows, image rows. Rewrite
 *     `images/foo.png` markdown refs to the R2 public URL inside `body_md`
 *     and `solution_md`.
 *  5. Mark the batch as `success` / `partial` / `failed` and persist the
 *     accumulated error log.
 *
 * Orphan images (uploaded but their owning problem failed to insert) stay
 * in R2 — Phase 10 will add a cleanup pass.
 */
export async function executeImport(params: {
  batchId: string;
  bundle: ParsedBundle;
  validation: ValidationReport;
  uploadedBy: string;
}): Promise<ExecuteResult> {
  const { batchId, bundle, validation, uploadedBy } = params;
  const errorLog: ExecuteErrorEntry[] = [];
  let successCount = 0;

  // 1. Mark processing.
  await db
    .update(importBatches)
    .set({ status: "processing" })
    .where(eq(importBatches.id, batchId));

  // 2. Auto-create missing sources/topics.
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
    await db
      .insert(topics)
      .values(
        allNewTopics.map((slug) => ({ name: slugToName(slug), slug }))
      )
      .onConflictDoNothing({ target: topics.slug });
  }

  // Re-read after the inserts so the slug→id map is complete.
  const [allSources, allTopics] = await Promise.all([
    db.select({ id: sources.id, slug: sources.slug }).from(sources),
    db.select({ id: topics.id, slug: topics.slug }).from(topics),
  ]);
  const sourceIdBySlug = new Map(allSources.map((r) => [r.slug, r.id]));
  const topicIdBySlug = new Map(allTopics.map((r) => [r.slug, r.id]));

  // 3. Upload all images once.
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

  // 4. Insert each valid, non-duplicate problem in its own transaction.
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
          .map((t) => topicIdBySlug.get(t))
          .filter((id): id is string => typeof id === "string");
        if (topicIds.length === 0) {
          throw new Error("No valid topic IDs for this problem");
        }

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

  // 5. Finalize batch row.
  const total = validation.problems.length;
  const status: ExecuteResult["status"] =
    successCount === total
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

  return { batchId, successCount, totalCount: total, errorLog, status };
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
