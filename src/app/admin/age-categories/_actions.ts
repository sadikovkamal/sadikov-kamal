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
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug faqat a-z, 0-9 va `-` belgilarini qabul qiladi"),
  description: z
    .string()
    .max(500)
    .nullable()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null)),
  sortOrder: z.number().int().min(0).max(9999).default(0),
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
  revalidatePath(`/admin/age-categories/${id}`);
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
        "O'chirib bo'lmadi: bu toifaga taglangan masalalar bor. Avval ularning tagini olib tashlang."
      ),
    };
  }
  revalidatePath("/admin/age-categories");
  revalidatePath("/admin");
  return { success: true };
}

function friendly(e: unknown, fallback: string): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/unique/i.test(msg) || /23505/.test(msg)) return "Slug allaqachon ishlatilgan";
  return fallback;
}
