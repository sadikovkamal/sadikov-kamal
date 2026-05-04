"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  createTag,
  updateTag,
  deleteTag,
  mergeTag,
} from "@/lib/taxonomy/mutations";

const tagSchema = z.object({
  name: z.string().min(1).max(50),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug faqat a-z, 0-9 va `-` belgilarini qabul qiladi"),
});

export type ActionResult = { success: true } | { error: string };

export async function createTagAction(raw: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = tagSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await createTag(parsed.data);
  } catch (e) {
    return { error: friendly(e, "Teg yaratib bo'lmadi") };
  }
  revalidatePath("/admin/tags");
  revalidatePath("/admin");
  return { success: true };
}

export async function updateTagAction(
  id: string,
  raw: unknown
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = tagSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await updateTag(id, parsed.data);
  } catch (e) {
    return { error: friendly(e, "Saqlash muvaffaqiyatsiz tugadi") };
  }
  revalidatePath("/admin/tags");
  revalidatePath("/admin");
  return { success: true };
}

export async function deleteTagAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await deleteTag(id);
  } catch (e) {
    return {
      error: friendly(
        e,
        "O'chirib bo'lmadi: bu tegga bog'liq masalalar bor. Avval ularni boshqa tegga ko'chiring yoki merge qiling."
      ),
    };
  }
  revalidatePath("/admin/tags");
  revalidatePath("/admin");
  return { success: true };
}

const mergeSchema = z.object({
  fromId: z.string().uuid(),
  toId: z.string().uuid(),
});

export async function mergeTagAction(raw: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = mergeSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (parsed.data.fromId === parsed.data.toId) {
    return { error: "Manba va manzil teg bir xil bo'la olmaydi" };
  }
  try {
    await mergeTag(parsed.data.fromId, parsed.data.toId);
  } catch (e) {
    return { error: friendly(e, "Merge muvaffaqiyatsiz tugadi") };
  }
  revalidatePath("/admin/tags");
  revalidatePath("/admin");
  return { success: true };
}

function friendly(e: unknown, fallback: string): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/unique/i.test(msg) || /23505/.test(msg)) return "Slug allaqachon ishlatilgan";
  if (/foreign key|23503/i.test(msg)) return fallback;
  return fallback;
}
