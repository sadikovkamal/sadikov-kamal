"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { uploadFile, type UploadResult } from "@/lib/storage/r2";

const schema = z.object({
  prefix: z.string().min(1).max(100),
});

export type UploadActionResult =
  | { success: true; storageKey: string; publicUrl: string; sizeBytes: number; mimeType: string }
  | { success?: false; error: string };

export async function uploadImageAction(
  formData: FormData
): Promise<UploadActionResult> {
  await requireAdmin();

  const file = formData.get("file");
  const prefix = formData.get("prefix");

  if (!(file instanceof File)) {
    return { error: "No file provided" };
  }

  const parsed = schema.safeParse({ prefix });
  if (!parsed.success) {
    return { error: "Invalid prefix" };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const result: UploadResult = await uploadFile({
      file: new Uint8Array(arrayBuffer),
      mimeType: file.type,
      originalFilename: file.name,
      prefix: parsed.data.prefix,
    });
    return {
      success: true,
      storageKey: result.storageKey,
      publicUrl: result.publicUrl,
      sizeBytes: result.sizeBytes,
      mimeType: result.mimeType,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload failed" };
  }
}
