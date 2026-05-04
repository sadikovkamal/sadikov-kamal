"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  createSource,
  updateSource,
  deleteSource,
} from "@/lib/taxonomy/mutations";

const sourceSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug faqat a-z, 0-9 va `-` belgilarini qabul qiladi"),
  kind: z.enum(["olympiad", "book", "course", "other"]),
  country: z
    .string()
    .max(50)
    .nullable()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null)),
});

export type ActionResult = { success: true } | { error: string };

export async function createSourceAction(raw: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = sourceSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await createSource(parsed.data);
  } catch (e) {
    return { error: friendly(e, "Manba yaratib bo'lmadi") };
  }
  revalidatePath("/admin/sources");
  revalidatePath("/admin");
  return { success: true };
}

export async function updateSourceAction(
  id: string,
  raw: unknown
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = sourceSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await updateSource(id, parsed.data);
  } catch (e) {
    return { error: friendly(e, "Saqlash muvaffaqiyatsiz tugadi") };
  }
  revalidatePath("/admin/sources");
  revalidatePath("/admin");
  return { success: true };
}

export async function deleteSourceAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await deleteSource(id);
  } catch (e) {
    return {
      error: friendly(
        e,
        "O'chirib bo'lmadi: bu manbadagi masalalar bor. Avval ularni boshqa manbaga ko'chiring."
      ),
    };
  }
  revalidatePath("/admin/sources");
  revalidatePath("/admin");
  return { success: true };
}

function friendly(e: unknown, fallback: string): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/unique/i.test(msg) || /23505/.test(msg)) return "Slug allaqachon ishlatilgan";
  if (/foreign key|23503/i.test(msg)) return fallback;
  return fallback;
}
