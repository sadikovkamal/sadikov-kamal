"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
    manifestPresent: boolean;
  };
}
export type PreviewResult = PreviewSuccess | { error: string };

/**
 * Stage 1: parse + validate the uploaded ZIP, return a report. No writes.
 *
 * The client keeps the File in memory and re-sends it for execute. We
 * accept the duplicated upload as the simplest UX — too small to optimize
 * for MVP. (For very large bundles, we'd stage the bytes in R2 between
 * the two stages.)
 */
export async function previewImportAction(
  formData: FormData
): Promise<PreviewResult> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "No file uploaded" };
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
      manifestPresent: !!bundle.manifest,
    },
  };
}

/**
 * Stage 2: run the executor synchronously and redirect to the problems
 * list. Batch history was removed (admins don't need to revisit past
 * imports), so there's no DB row tracking the operation — only the
 * imported `problems` rows survive.
 */
export async function executeImportAction(
  formData: FormData
): Promise<{ error: string } | void> {
  const user = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "No file uploaded" };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const bundle = await parseBundle(bytes);
  const validation = await validateBundle(bundle);

  // Reject early if the bundle itself is broken — no point spinning up
  // the executor for a structurally invalid ZIP.
  if (validation.bundleErrors.length > 0) {
    return {
      error: `Bundle has errors: ${validation.bundleErrors.join("; ")}`,
    };
  }

  const result = await executeImport({
    bundle,
    validation,
    uploadedBy: user.id,
  });

  if (result.successCount === 0) {
    const firstErr = result.errorLog[0]?.error ?? "Import failed";
    return { error: firstErr };
  }

  revalidatePath("/admin/problems");
  redirect("/admin/problems");
}
