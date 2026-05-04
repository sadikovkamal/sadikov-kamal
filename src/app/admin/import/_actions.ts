"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { importBatches } from "@/db/schema";
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
 * Stage 2: create an import_batches row and run the executor synchronously.
 * Redirects to the batch detail page on completion (success / partial / failed).
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

  // Reject early if the bundle itself is broken — no point creating a row.
  if (validation.bundleErrors.length > 0) {
    return {
      error: `Bundle has errors: ${validation.bundleErrors.join("; ")}`,
    };
  }

  const [batch] = await db
    .insert(importBatches)
    .values({
      uploadedBy: user.id,
      filename: file.name,
      status: "pending",
      totalCount: bundle.problems.length,
    })
    .returning({ id: importBatches.id });

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
