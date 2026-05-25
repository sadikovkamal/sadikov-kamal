import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  problems,
  problemTopics,
  problemAgeCategories,
  images,
} from "@/db/schema";
import { uploadFile } from "@/lib/storage/r2";
import {
  formatProblemCode,
  parseProblemCodeSeq,
} from "@/lib/problems/codes";
import type { ParsedBundle } from "./parse";
import type { ValidationReport } from "./validate";
import { BUNDLE_LIMITS } from "./schema";

export interface ExecuteErrorEntry {
  index: number;
  sourcePath: string;
  error: string;
}

export interface ExecuteResult {
  successCount: number;
  totalCount: number;
  /** Codes of the newly created problems, in import order (e.g. ["P0000123", "P0000124"]). */
  createdCodes: string[];
  errorLog: ExecuteErrorEntry[];
}

/**
 * Execute an already-validated v2 import.
 *
 * Preconditions enforced by the caller (`executeImportAction`):
 *  - `validation.bundleErrors` is empty.
 *  - `validation.errorCount === 0` (every problem has `status === "ok"`).
 *
 * With those in place, this function:
 *  1. Uploads each referenced image to R2 once under `imports/{timestamp}/`.
 *  2. For each problem, runs a transaction that inserts the `problems`
 *     row (auto-assigning a `P#######` code), the topic/age junction
 *     rows, and the single image row. Image markdown refs in `body_md`
 *     are rewritten to absolute R2 URLs.
 *
 * No taxonomy auto-creation, no manifest, no dedup — those features
 * were removed when the format moved to explicit stable codes.
 */
export async function executeImport(params: {
  bundle: ParsedBundle;
  validation: ValidationReport;
  uploadedBy: string;
}): Promise<ExecuteResult> {
  const { bundle, validation, uploadedBy } = params;
  const errorLog: ExecuteErrorEntry[] = [];
  const createdCodes: string[] = [];
  let successCount = 0;

  // 1. Upload all images. Prefix is a timestamp folder under `imports/` —
  //    random enough to avoid collisions and easy to spot in R2. Uploads
  //    run with bounded concurrency: pure-sequential burns the whole
  //    bundle's seconds in network RTT, but unbounded `Promise.all` can
  //    saturate the function's open-socket budget on 200-problem bundles.
  //    Six in flight at once is the well-known sweet spot for S3-like APIs.
  const uploadPrefix = `imports/${Date.now()}`;
  interface UploadedImage {
    storageKey: string;
    publicUrl: string;
    sizeBytes: number;
    mimeType: string;
    originalFilename: string;
  }
  const imageUrlByFilename = new Map<string, UploadedImage>();

  const UPLOAD_CONCURRENCY = 6;
  const entries = Array.from(bundle.images.entries());
  await runWithConcurrency(entries, UPLOAD_CONCURRENCY, async ([filename, bytes]) => {
    try {
      const mimeType = guessMimeType(filename);
      const uploaded = await uploadFile({
        file: bytes,
        mimeType,
        originalFilename: filename,
        prefix: uploadPrefix,
        // Import images aren't bounded by the single-upload 4 MB form
        // cap — the ZIP itself is already capped at BUNDLE_LIMITS.maxBytes.
        maxBytes: BUNDLE_LIMITS.maxBytes,
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
  });

  // 2. Insert each problem in its own transaction. Validation already
  //    rejected anything that wasn't ok, so we skip non-ok entries
  //    defensively but they shouldn't appear.
  for (const v of validation.problems) {
    if (v.status !== "ok" || !v.resolved) {
      errorLog.push({
        index: v.index,
        sourcePath: v.sourcePath,
        error: v.errors.join("; ") || "Validation error",
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

    const { sourceId, ageCategoryIds, topicIds } = v.resolved;

    const rewrite = (md: string): string =>
      md.replace(
        /!\[([^\]]*)\]\(images\/([^)]+)\)/g,
        (_, alt: string, ref: string) => {
          const img = imageUrlByFilename.get(ref);
          return img
            ? `![${alt}](${img.publicUrl})`
            : `![${alt}](images/${ref})`;
        }
      );

    try {
      const code = await db.transaction(async (tx) => {
        // Auto-assign P####### code inside the transaction. We compute
        // it per row so each insert sees the latest max even when many
        // problems land in a single batch.
        const [maxRow] = await tx
          .select({
            maxCode: sql<string | null>`max(${problems.code})`,
          })
          .from(problems);
        const maxCode = maxRow?.maxCode ?? null;
        const seq = maxCode ? parseProblemCodeSeq(maxCode) : 0;
        const code = formatProblemCode(
          Number.isFinite(seq) ? seq + 1 : 1
        );

        const [createdProblem] = await tx
          .insert(problems)
          .values({
            code,
            bodyMd: rewrite(parsed.bodyMd),
            sourceId,
            createdBy: uploadedBy,
            metadata: {},
          })
          .returning({ id: problems.id });

        if (!createdProblem) throw new Error("Problem insert returned no rows");

        await tx.insert(problemTopics).values(
          topicIds.map((topicId) => ({
            problemId: createdProblem.id,
            topicId,
          }))
        );
        await tx.insert(problemAgeCategories).values(
          ageCategoryIds.map((ageCategoryId) => ({
            problemId: createdProblem.id,
            ageCategoryId,
          }))
        );

        // At most one image per problem (validator enforces it).
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

        return code;
      });

      createdCodes.push(code);
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
    createdCodes,
    errorLog,
  };
}

/**
 * Run `worker` over `items` with at most `limit` running in parallel.
 * Returns after every item has been visited (errors are swallowed by the
 * caller's try/catch inside `worker`). Order of completion is not
 * preserved, but the result is collected by side effect via `worker` so
 * that doesn't matter here.
 */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  let cursor = 0;
  const workers: Promise<void>[] = [];
  const next = async (): Promise<void> => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      await worker(items[i]!);
    }
  };
  for (let w = 0; w < Math.min(limit, items.length); w++) {
    workers.push(next());
  }
  await Promise.all(workers);
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
    default:
      return "application/octet-stream";
  }
}
