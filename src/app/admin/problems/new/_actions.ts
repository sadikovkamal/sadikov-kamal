"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { parseBundle } from "@/lib/import/parse";
import { validateBundle, type ValidationReport } from "@/lib/import/validate";
import { executeImport } from "@/lib/import/execute";

export interface PreviewSuccess {
  success: true;
  filename: string;
  size: number;
  validation: ValidationReport;
  parsedSummary: {
    problemCount: number;
    imageCount: number;
  };
}
export type PreviewResult = PreviewSuccess | { error: string };

export interface ExecuteSuccess {
  success: true;
  successCount: number;
  totalCount: number;
  createdCodes: string[];
}
export type ExecuteResult = ExecuteSuccess | { error: string };

/**
 * Stage 1: parse + validate the uploaded ZIP, return a report. No writes.
 *
 * The client keeps the File in memory and re-sends it for execute. We
 * accept the duplicated upload as the simplest UX — too small to
 * optimize for the MVP. (For very large bundles we'd stage the bytes
 * in R2 between the two stages.)
 */
export async function previewImportAction(
  formData: FormData
): Promise<PreviewResult> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "Fayl yuklanmadi" };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const bundle = await parseBundle(bytes);
  const validation = await validateBundle(bundle);

  return {
    success: true,
    filename: file.name,
    size: file.size,
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
  formData: FormData
): Promise<ExecuteResult> {
  const user = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "Fayl yuklanmadi" };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const bundle = await parseBundle(bytes);
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
