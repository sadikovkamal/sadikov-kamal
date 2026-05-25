"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  createMethod,
  updateMethod,
  deleteMethod,
} from "@/lib/taxonomy/mutations";

const methodSchema = z.object({
  name: z.string().min(1).max(100),
  parentId: z.string().uuid().nullable(),
  description: z.string().max(1000).nullable(),
});

const idSchema = z.string().uuid();

export type ActionResult = { success: true } | { error: string };

export async function createMethodAction(raw: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = methodSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await createMethod(parsed.data);
  } catch (e) {
    return {
      error: friendlyError(e, "Metod yaratib bo'lmadi (nom band bo'lishi mumkin)"),
    };
  }
  revalidatePath("/admin/methods");
  revalidatePath("/admin");
  return { success: true };
}

export async function updateMethodAction(
  id: string,
  raw: unknown
): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return { error: "Invalid id" };
  const parsed = methodSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (parsed.data.parentId === id) {
    return { error: "Metod o'ziga parent bo'la olmaydi" };
  }
  try {
    await updateMethod(id, parsed.data);
  } catch (e) {
    return { error: friendlyError(e, "Saqlash muvaffaqiyatsiz tugadi") };
  }
  revalidatePath("/admin/methods");
  revalidatePath("/admin");
  return { success: true };
}

export async function deleteMethodAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return { error: "Invalid id" };
  try {
    await deleteMethod(id);
  } catch (e) {
    return {
      error: friendlyError(
        e,
        "O'chirib bo'lmadi: bu metodga bog'liq masalalar bor. Avval ularni boshqa metodga ko'chiring."
      ),
    };
  }
  revalidatePath("/admin/methods");
  revalidatePath("/admin");
  return { success: true };
}

function friendlyError(e: unknown, fallback: string): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/unique/i.test(msg) || /23505/.test(msg)) {
    return "Bu nomli metod allaqachon mavjud";
  }
  return fallback;
}
