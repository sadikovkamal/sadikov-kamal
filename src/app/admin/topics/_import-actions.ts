"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  parseTopicsXlsx,
  validateTopicsBundle,
  type ValidationReport,
} from "@/lib/taxonomy/topics-xlsx";
import { bulkCreateTopics } from "@/lib/taxonomy/mutations";

export interface PreviewSuccess {
  success: true;
  filename: string;
  size: number;
  validation: ValidationReport;
  parsedSummary: { rowCount: number };
}
export type PreviewResult = PreviewSuccess | { error: string };

export interface ExecuteSuccess {
  success: true;
  successCount: number;
  createdCodes: string[];
}
export type ExecuteResult = ExecuteSuccess | { error: string };

/**
 * Stage 1: parse + validate, return a report. No writes. Client keeps the
 * File in memory and re-sends it on execute — same pattern as the problem
 * importer. We re-parse on stage 2 rather than trust the report shape.
 */
export async function previewTopicsImportAction(
  formData: FormData
): Promise<PreviewResult> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "Fayl yuklanmadi" };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const parsed = await parseTopicsXlsx(bytes);
  const validation = await validateTopicsBundle(parsed);

  return {
    success: true,
    filename: file.name,
    size: file.size,
    validation,
    parsedSummary: { rowCount: parsed.rows.length },
  };
}

/**
 * Stage 2: insert only when validation is fully clean. We re-validate
 * here so a tampered client can't bypass row errors.
 */
export async function executeTopicsImportAction(
  formData: FormData
): Promise<ExecuteResult> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "Fayl yuklanmadi" };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const parsed = await parseTopicsXlsx(bytes);
  const validation = await validateTopicsBundle(parsed);

  if (validation.bundleErrors.length > 0 || validation.errorCount > 0) {
    return {
      error:
        "Faylda xatolik bor. Avval xatolarni tuzating, so'ng qaytadan urinib ko'ring.",
    };
  }

  const inputs = validation.rows.map((r) => ({
    name: r.name,
    parentId: r.parentId,
    description: r.description,
  }));

  if (inputs.length === 0) {
    return { error: "Faylda hech qanday mavzu topilmadi" };
  }

  try {
    const { createdCodes } = await bulkCreateTopics(inputs);
    revalidatePath("/admin/topics");
    revalidatePath("/admin");
    return {
      success: true,
      successCount: createdCodes.length,
      createdCodes,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/unique/i.test(msg) || /23505/.test(msg)) {
      return {
        error:
          "Saqlash paytida nom to'qnashuvi yuz berdi. Qaytadan urinib ko'ring.",
      };
    }
    return { error: "Saqlash muvaffaqiyatsiz tugadi" };
  }
}
