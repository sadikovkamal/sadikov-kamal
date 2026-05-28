"use server";

import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  createPresignedUploadUrl,
  getObjectBytes,
  deleteFile,
  MAX_IMPORT_BYTES,
} from "@/lib/storage/r2";
import { parseBundle } from "@/lib/import/parse";
import { validateBundle, type ValidationReport } from "@/lib/import/validate";
import { executeImport } from "@/lib/import/execute";

/**
 * Staging keys live under `imports/` and are random nanoids. The reader
 * actions validate against this shape so an authenticated admin can't
 * point the downloader at an arbitrary object in the bucket. nanoid's
 * default alphabet is `A-Za-z0-9_-`.
 */
const IMPORT_KEY_RE = /^imports\/[A-Za-z0-9_-]+\.zip$/;

const IMPORT_CONTENT_TYPE = "application/zip";

export interface UploadUrlSuccess {
  success: true;
  uploadUrl: string;
  storageKey: string;
  /** Echoed back so the client sends the matching PUT Content-Type. */
  contentType: string;
}
export type UploadUrlResult = UploadUrlSuccess | { error: string };

export interface PreviewSuccess {
  success: true;
  size: number;
  validation: ValidationReport;
  parsedSummary: {
    problemCount: number;
    imageCount: number;
  };
}
export type PreviewResult = PreviewSuccess | { error: string };

/**
 * Stage 0: hand the browser a short-lived presigned PUT so it can upload
 * the ZIP straight to R2, bypassing Vercel's ~4.5 MB server-action body
 * cap. The browser then references the returned `storageKey` for both
 * the preview and execute stages.
 */
export async function createImportUploadUrlAction(): Promise<UploadUrlResult> {
  await requireAdmin();
  const storageKey = `imports/${nanoid(16)}.zip`;
  try {
    const uploadUrl = await createPresignedUploadUrl({
      storageKey,
      contentType: IMPORT_CONTENT_TYPE,
    });
    return { success: true, uploadUrl, storageKey, contentType: IMPORT_CONTENT_TYPE };
  } catch (e) {
    return {
      error:
        e instanceof Error ? e.message : "Yuklash manzilini olishda xatolik",
    };
  }
}

/**
 * Read a staged ZIP back out of R2 with a defensive key-shape check and a
 * size cap. Returns the bytes or a user-facing error string.
 */
async function readStagedBundle(
  storageKey: string
): Promise<{ bytes: Uint8Array } | { error: string }> {
  if (!IMPORT_KEY_RE.test(storageKey)) {
    return { error: "Yaroqsiz fayl kaliti" };
  }
  let bytes: Uint8Array;
  try {
    bytes = await getObjectBytes(storageKey);
  } catch {
    return {
      error: "Yuklangan faylni o'qib bo'lmadi. Qaytadan urinib ko'ring.",
    };
  }
  if (bytes.byteLength > MAX_IMPORT_BYTES) {
    const maxMb = MAX_IMPORT_BYTES / (1024 * 1024);
    return { error: `Arxiv juda katta (maksimum ${maxMb} MB).` };
  }
  return { bytes };
}

export interface ExecuteSuccess {
  success: true;
  successCount: number;
  totalCount: number;
  createdCodes: string[];
}
export type ExecuteResult = ExecuteSuccess | { error: string };

/**
 * Stage 1: parse + validate the ZIP staged in R2, return a report. No
 * writes. The same `storageKey` is reused for execute, so the file is
 * uploaded only once.
 */
export async function previewImportAction(
  storageKey: string
): Promise<PreviewResult> {
  await requireAdmin();

  const read = await readStagedBundle(storageKey);
  if ("error" in read) return read;

  const bundle = await parseBundle(read.bytes);
  const validation = await validateBundle(bundle);

  return {
    success: true,
    size: read.bytes.byteLength,
    validation,
    parsedSummary: {
      problemCount: bundle.problems.length,
      imageCount: bundle.images.size,
    },
  };
}

/**
 * Stage 2: run the executor only if validation is fully clean. Returns
 * the created problem codes so the UI can show them; the user navigates
 * to the problems list manually after closing the success modal.
 */
export async function executeImportAction(
  storageKey: string
): Promise<ExecuteResult> {
  const user = await requireAdmin();

  const read = await readStagedBundle(storageKey);
  if ("error" in read) return read;

  const bundle = await parseBundle(read.bytes);
  const validation = await validateBundle(bundle);

  // Hard-stop: any error anywhere means we don't write a single row.
  // Matches the product decision — admin fixes the ZIP, retries.
  if (
    validation.bundleErrors.length > 0 ||
    validation.errorCount > 0
  ) {
    return {
      error:
        "Arxivda xatolik bor. Avval xatolarni tuzating, so'ng qaytadan urinib ko'ring.",
    };
  }

  if (bundle.problems.length === 0) {
    return { error: "Arxivda hech qanday masala topilmadi" };
  }

  const result = await executeImport({
    bundle,
    validation,
    uploadedBy: user.id,
  });

  if (result.successCount === 0) {
    const firstErr = result.errorLog[0]?.error ?? "Import muvaffaqiyatsiz";
    return { error: firstErr };
  }

  // Import succeeded — the staging ZIP is no longer needed. Best-effort
  // delete: a failure here must not fail the import (and the `imports/`
  // lifecycle rule sweeps anything left behind). Error paths above
  // deliberately keep the object so a transient failure can be retried
  // with the same key; orphans are reclaimed by the lifecycle rule.
  try {
    await deleteFile(storageKey);
  } catch {
    // ignore — lifecycle rule will reclaim it
  }

  // Import affects per-source / per-topic problem counts, so the
  // taxonomy pages must be revalidated too — otherwise the source
  // explorer keeps showing the pre-import "0 ta masala" rollup until
  // the next manual mutation. The dashboard reads taxonomy counts too.
  revalidatePath("/admin/problems");
  revalidatePath("/admin/sources");
  revalidatePath("/admin/topics");
  revalidatePath("/admin");

  return {
    success: true,
    successCount: result.successCount,
    totalCount: result.totalCount,
    createdCodes: result.createdCodes,
  };
}
