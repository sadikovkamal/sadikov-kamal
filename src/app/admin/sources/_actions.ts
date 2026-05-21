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
  parentId: z.string().uuid().nullable(),
  logoStorageKey: z
    .string()
    .max(500)
    .nullable()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null)),
  description: z
    .string()
    .max(2000)
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
  if (parsed.data.parentId === id) {
    return { error: "Manba o'ziga parent bo'la olmaydi" };
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

function friendly(_e: unknown, fallback: string): string {
  // Every DB error funnels to the UX-facing fallback today; the helper
  // exists so adding error-class-specific translations later (e.g.
  // unique hits when we add per-org source uniqueness) is a single edit.
  return fallback;
}
