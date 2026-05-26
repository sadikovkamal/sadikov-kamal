"use server";

import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { type PrintProblem } from "@/lib/print/types";
import { getProblemsForPrint } from "@/lib/problems/queries";

import { BULK_OP_LIMIT } from "./_constants";

// ---------------------------------------------------------------------------
// Shared validation
// ---------------------------------------------------------------------------

const idsSchema = z
  .array(z.string().uuid())
  .min(1)
  .max(BULK_OP_LIMIT);

// ---------------------------------------------------------------------------
// loadProblemsForPrintAction
// ---------------------------------------------------------------------------

/**
 * Fetches the full `PrintProblem` rows for the supplied UUIDs in the
 * caller's order. Missing IDs are silently dropped — the dialog compares
 * lengths and calls `deselectMany(missing)` on the client. Returns a
 * single-shape discriminated-union result so the client can branch on
 * `ok` without try/catch.
 *
 * NOTE on architecture: docx generation used to live alongside this
 * action (`generatePrintDocxAction`) but moved to
 * `/api/admin/problems/print-docx`. Server actions on Vercel have a
 * ~4.5 MB response cap that a 25-problem worksheet with images blew
 * through, surfacing as an opaque "Hujjat tayyorlashda xatolik" with no
 * indication of the underlying cause. The route handler has no such cap
 * and streams the binary cleanly. This action is kept because the
 * JSON-shaped problem list comfortably fits the cap and the
 * useTransition/error semantics are nicer for in-dialog loading.
 */
export async function loadProblemsForPrintAction(
  ids: string[],
): Promise<
  | { ok: true; problems: PrintProblem[] }
  | { ok: false; error: string }
> {
  await requireAdmin();

  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid ids",
    };
  }

  try {
    const problems = await getProblemsForPrint(parsed.data);
    return { ok: true, problems };
  } catch (err) {
    console.error("[loadProblemsForPrintAction]", err);
    return { ok: false, error: "Masalalarni yuklab bo'lmadi" };
  }
}
