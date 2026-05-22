"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  createTopic,
  updateTopic,
  deleteTopic,
} from "@/lib/taxonomy/mutations";

const topicSchema = z.object({
  name: z.string().min(1).max(100),
  parentId: z.string().uuid().nullable(),
  description: z.string().max(1000).nullable(),
});

const idSchema = z.string().uuid();

export type ActionResult = { success: true } | { error: string };

export async function createTopicAction(raw: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = topicSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await createTopic(parsed.data);
  } catch (e) {
    return {
      error: friendlyError(e, "Mavzu yaratib bo'lmadi (nom band bo'lishi mumkin)"),
    };
  }
  revalidatePath("/admin/topics");
  revalidatePath("/admin");
  return { success: true };
}

export async function updateTopicAction(
  id: string,
  raw: unknown
): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return { error: "Invalid id" };
  const parsed = topicSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (parsed.data.parentId === id) {
    return { error: "Mavzu o'ziga parent bo'la olmaydi" };
  }
  try {
    await updateTopic(id, parsed.data);
  } catch (e) {
    return { error: friendlyError(e, "Saqlash muvaffaqiyatsiz tugadi") };
  }
  revalidatePath("/admin/topics");
  revalidatePath("/admin");
  return { success: true };
}

export async function deleteTopicAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return { error: "Invalid id" };
  try {
    await deleteTopic(id);
  } catch (e) {
    return {
      error: friendlyError(
        e,
        "O'chirib bo'lmadi: bu mavzuga bog'liq masalalar bor. Avval ularni boshqa mavzuga ko'chiring."
      ),
    };
  }
  revalidatePath("/admin/topics");
  revalidatePath("/admin");
  return { success: true };
}

function friendlyError(e: unknown, fallback: string): string {
  const msg = e instanceof Error ? e.message : String(e);
  // Postgres unique constraint — only error class we still translate.
  // Foreign-key violations (RESTRICT on delete) reuse `fallback`, so we
  // don't pattern-match them.
  if (/unique/i.test(msg) || /23505/.test(msg)) {
    return "Bu nomli mavzu allaqachon mavjud";
  }
  return fallback;
}
