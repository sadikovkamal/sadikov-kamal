"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { deleteFile } from "@/lib/storage/r2";
import {
  createProblemTx,
  updateProblemTx,
  deleteProblemTx,
  bulkDeleteProblemsTx,
  bulkUpdateProblemsTx,
  type ProblemInput,
} from "@/lib/problems/mutations";

const problemSchema = z.object({
  bodyMd: z.string().min(1, "Problem body is required"),
  sourceId: z.string().uuid("Pick a source"),
  topicIds: z.array(z.string().uuid()).min(1, "Pick at least one topic"),
  // Age categories — UUID references into the `age_categories` taxonomy.
  // A problem can match multiple buckets (e.g. "10-sinf" + "11-sinf" or
  // "11-sinf" + "Talaba"). At least one is required so listing/filtering
  // by audience always has a sensible answer.
  ageCategoryIds: z
    .array(z.string().uuid())
    .min(1, "Kamida bitta yosh toifasini tanlang"),
  image: z
    .object({
      storageKey: z.string().min(1),
      publicUrl: z.string().url(),
      originalFilename: z.string(),
      sizeBytes: z.number().int().nonnegative(),
      mimeType: z.string().min(1),
    })
    .nullable()
    .default(null),
});

export type ProblemActionResult = { error: string } | void;

/**
 * Best-effort R2 cleanup. Runs after the DB transaction commits so a
 * failure here leaves the DB consistent (worst case: an orphan object
 * costs ~$0.015/GB/month — far cheaper than a half-finished mutation).
 * Errors are logged but never propagated.
 */
async function cleanupOrphans(keys: string[]) {
  if (keys.length === 0) return;
  await Promise.allSettled(
    keys.map(async (key) => {
      try {
        await deleteFile(key);
      } catch (e) {
        console.warn(`[orphan-cleanup] failed to delete ${key}:`, e);
      }
    })
  );
}

export async function createProblemAction(
  raw: unknown
): Promise<ProblemActionResult> {
  const user = await requireAdmin();
  const parsed = problemSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const input: ProblemInput = parsed.data;

  let createdId: string;
  try {
    createdId = await createProblemTx(input, user.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create problem" };
  }

  revalidatePath("/admin/problems");
  // redirect() throws an internal Next.js signal; must run outside try/catch.
  redirect(`/admin/problems/${createdId}`);
}

export async function updateProblemAction(
  id: string,
  raw: unknown
): Promise<ProblemActionResult> {
  await requireAdmin();
  const parsed = problemSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const input: ProblemInput = parsed.data;

  let orphans: string[] = [];
  try {
    const result = await updateProblemTx(id, input);
    orphans = result.orphanStorageKeys;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update problem" };
  }

  await cleanupOrphans(orphans);

  revalidatePath("/admin/problems");
  revalidatePath(`/admin/problems/${id}`);
  redirect(`/admin/problems/${id}`);
}

export async function deleteProblemAction(id: string): Promise<ProblemActionResult> {
  await requireAdmin();

  let orphans: string[] = [];
  try {
    const result = await deleteProblemTx(id);
    orphans = result.orphanStorageKeys;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Masala o'chirilmadi" };
  }

  await cleanupOrphans(orphans);

  revalidatePath("/admin/problems");
  redirect("/admin/problems");
}

const bulkDeleteSchema = z
  .array(z.string().uuid())
  .max(500, "Bir vaqtda 500 dan ortiq masala o'chirib bo'lmaydi");

export async function bulkDeleteProblemsAction(ids: string[]) {
  await requireAdmin();
  const parsed = bulkDeleteSchema.safeParse(ids);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid ids",
    };
  }
  if (parsed.data.length === 0) return;

  let orphans: string[] = [];
  try {
    const result = await bulkDeleteProblemsTx(parsed.data);
    orphans = result.orphanStorageKeys;
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Masalalarni o'chirib bo'lmadi",
    };
  }

  await cleanupOrphans(orphans);
  revalidatePath("/admin/problems");
}

/**
 * Bulk-update one or more shared fields on a set of problems. Each
 * field is optional — only fields present in the payload are applied,
 * and m2m fields (topics, age categories) replace the existing set on
 * every selected problem.
 *
 * Constraints:
 *   - 1..500 problem ids
 *   - At least one field present (sourceId / ageCategoryIds / topicIds)
 *   - m2m fields, when present, must contain ≥ 1 id (matches the schema's
 *     "every problem must have at least one topic and one age category"
 *     rule — see ProblemInput).
 */
const bulkUpdateSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1).max(500),
    sourceId: z.string().uuid().optional(),
    ageCategoryIds: z.array(z.string().uuid()).min(1).optional(),
    topicIds: z.array(z.string().uuid()).min(1).optional(),
  })
  .refine(
    (data) =>
      data.sourceId !== undefined ||
      data.ageCategoryIds !== undefined ||
      data.topicIds !== undefined,
    { message: "Kamida bitta maydonni o'zgartiring" }
  );

export async function bulkUpdateProblemsAction(input: unknown) {
  await requireAdmin();
  const parsed = bulkUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    await bulkUpdateProblemsTx(parsed.data);
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? e.message
          : "Masalalarni o'zgartirib bo'lmadi",
    };
  }
  revalidatePath("/admin/problems");
}
