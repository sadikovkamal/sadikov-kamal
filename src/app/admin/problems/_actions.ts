"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import {
  createProblemTx,
  updateProblemTx,
  deleteProblemTx,
  ensureTagsByName,
  type ProblemInput,
} from "@/lib/problems/mutations";

const problemSchema = z.object({
  bodyMd: z.string().min(1, "Problem body is required"),
  solutionMd: z.string().nullable().default(null),
  answer: z.string().nullable().default(null),
  sourceId: z.string().uuid("Pick a source"),
  year: z.number().int().min(1900).max(2100).nullable(),
  problemNumber: z.string().max(50).nullable(),
  difficulty: z.number().int().min(1).max(5),
  topicIds: z.array(z.string().uuid()).min(1, "Pick at least one topic"),
  classes: z
    .array(z.number().int().min(5).max(11))
    .min(1, "Pick at least one class"),
  tagNames: z.array(z.string().min(1).max(50)).default([]),
});

export type ProblemActionResult = { error: string } | void;

export async function createProblemAction(
  raw: unknown
): Promise<ProblemActionResult> {
  const user = await requireAdmin();
  const parsed = problemSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const tagIds = await ensureTagsByName(parsed.data.tagNames);
  const input: ProblemInput = { ...parsed.data, tagIds };

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

  const tagIds = await ensureTagsByName(parsed.data.tagNames);
  const input: ProblemInput = { ...parsed.data, tagIds };

  try {
    await updateProblemTx(id, input);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update problem" };
  }

  revalidatePath("/admin/problems");
  revalidatePath(`/admin/problems/${id}`);
  redirect(`/admin/problems/${id}`);
}

export async function deleteProblemAction(id: string) {
  await requireAdmin();
  await deleteProblemTx(id);
  revalidatePath("/admin/problems");
  redirect("/admin/problems");
}
