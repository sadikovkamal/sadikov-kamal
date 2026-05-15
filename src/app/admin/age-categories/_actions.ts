"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  createAgeCategory,
  updateAgeCategory,
  deleteAgeCategory,
} from "@/lib/taxonomy/mutations";

const ageCategorySchema = z.object({
  name: z.string().min(1).max(100),
  description: z
    .string()
    .max(1000)
    .nullable()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null)),
});

export type ActionResult = { success: true } | { error: string };

export async function createAgeCategoryAction(
  raw: unknown
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = ageCategorySchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await createAgeCategory(parsed.data);
  } catch (e) {
    return { error: friendly(e, "Yosh toifasini yaratib bo'lmadi") };
  }
  revalidatePath("/admin/age-categories");
  revalidatePath("/admin");
  return { success: true };
}

export async function updateAgeCategoryAction(
  id: string,
  raw: unknown
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = ageCategorySchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await updateAgeCategory(id, parsed.data);
  } catch (e) {
    return { error: friendly(e, "Saqlash muvaffaqiyatsiz tugadi") };
  }
  revalidatePath("/admin/age-categories");
  revalidatePath("/admin");
  return { success: true };
}

export async function deleteAgeCategoryAction(
  id: string
): Promise<ActionResult> {
  await requireAdmin();
  try {
    await deleteAgeCategory(id);
  } catch (e) {
    return {
      error: friendly(
        e,
        "O'chirib bo'lmadi: bu toifaga tegishli masalalar bor. Avval ularni boshqa toifaga ko'chiring."
      ),
    };
  }
  revalidatePath("/admin/age-categories");
  revalidatePath("/admin");
  return { success: true };
}

function friendly(_e: unknown, fallback: string): string {
  // See parallel comment in src/app/admin/sources/_actions.ts.
  return fallback;
}
