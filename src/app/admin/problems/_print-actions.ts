"use server";

import { Packer } from "docx";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { buildDocx } from "@/lib/print/docx";
import { fetchImageBytesBatch } from "@/lib/print/r2-fetch";
import {
  printConfigSchema,
  type PrintConfig,
  type PrintProblem,
} from "@/lib/print/types";
import { getProblemsForPrint } from "@/lib/problems/queries";

import { BULK_OP_LIMIT } from "./_constants";

// ---------------------------------------------------------------------------
// Shared validation
// ---------------------------------------------------------------------------

const idsSchema = z
  .array(z.string().uuid())
  .min(1)
  .max(BULK_OP_LIMIT);

const generateInputSchema = z
  .object({
    orderedIds: idsSchema,
    config: printConfigSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// loadProblemsForPrintAction
// ---------------------------------------------------------------------------

/**
 * Fetches the full `PrintProblem` rows for the supplied UUIDs in the
 * caller's order. Missing IDs are silently dropped — the dialog compares
 * lengths and calls `deselectMany(missing)` on the client. Returns a
 * single-shape discriminated-union result so the client can branch on
 * `ok` without try/catch.
 */
export async function loadProblemsForPrintAction(
  ids: string[],
): Promise<
  | { ok: true; problems: PrintProblem[] }
  | { ok: false; error: string }
> {
  await requireAdmin();

  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid ids",
    };
  }

  try {
    const problems = await getProblemsForPrint(parsed.data);
    return { ok: true, problems };
  } catch (err) {
    console.error("[loadProblemsForPrintAction]", err);
    return { ok: false, error: "Masalalarni yuklab bo'lmadi" };
  }
}

// ---------------------------------------------------------------------------
// generatePrintDocxAction
// ---------------------------------------------------------------------------

/**
 * Map a storage-key file extension to its likely MIME. Used to populate
 * the `mime` field of the images map that `buildDocx` consumes — the
 * docx walker forwards this verbatim to `ImageRun`'s `type` option. PNG
 * is a safe default because the `docx` library happily accepts a
 * mislabelled PNG type for most browsers' embedded images.
 */
function inferMimeFromKey(storageKey: string): string {
  const lower = storageKey.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot + 1) : "";
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    default:
      return "image/png";
  }
}

/**
 * Server-side .docx generator. Validates the payload, re-fetches the
 * full problem rows, downloads every referenced image from R2 in
 * bounded parallel, builds the document, packs it to a Buffer, and
 * returns the bytes as an `ArrayBuffer` so the browser can wrap it in a
 * `Blob` and trigger a download.
 *
 * The whole body is wrapped in try/catch — any failure (DB, R2, docx
 * serialisation) bubbles up as a single user-facing error string. Image
 * fetch failures DO NOT abort: they're reported via `partial.failedImages`
 * so the dialog can show a non-blocking banner.
 */
export async function generatePrintDocxAction(input: {
  orderedIds: string[];
  config: PrintConfig;
}): Promise<
  | {
      ok: true;
      bytes: ArrayBuffer;
      filename: string;
      partial?: { failedImages: number };
    }
  | { ok: false; error: string }
> {
  try {
    await requireAdmin();

    const parsed = generateInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }

    const problems = await getProblemsForPrint(parsed.data.orderedIds);
    if (problems.length === 0) {
      return { ok: false, error: "Hech qanday masala topilmadi" };
    }

    // Collect every referenced storage key (de-duplication happens inside
    // `fetchImageBytesBatch`, but we let it handle that to keep this layer
    // dumb).
    const storageKeys = problems.flatMap((p) =>
      p.images.map((img) => img.storageKey),
    );
    const batchResult = await fetchImageBytesBatch(storageKeys, {
      concurrency: 10,
    });

    // Build the URL-keyed map that `buildDocx` consumes. Markdown bodies
    // reference images by their public URL (`![](url)`), so the walker
    // looks up by `url` — not `storageKey`. We carry both on the
    // `PrintProblem`, fetch by `storageKey`, and re-key here.
    const imagesByUrl = new Map<string, { bytes: Uint8Array; mime: string }>();
    for (const problem of problems) {
      for (const img of problem.images) {
        const bytes = batchResult.results.get(img.storageKey);
        if (!bytes) continue;
        imagesByUrl.set(img.url, {
          bytes,
          mime: inferMimeFromKey(img.storageKey),
        });
      }
    }

    const failedImages = batchResult.failures.size;

    const doc = buildDocx(problems, parsed.data.config, imagesByUrl);
    const buffer = await Packer.toBuffer(doc);

    // `Packer.toBuffer` returns a Node `Buffer` — which is a `Uint8Array`
    // view over a (possibly shared) underlying `ArrayBuffer`. Slice out
    // the exact byte window so the wire payload is independent of any
    // pooled allocator on the server. The cast is safe: Node's `Buffer`
    // is always backed by a real `ArrayBuffer`, never `SharedArrayBuffer`.
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;

    const filename = `masalalar-${new Date().toISOString().slice(0, 10)}.docx`;

    return {
      ok: true,
      bytes: arrayBuffer,
      filename,
      partial: failedImages > 0 ? { failedImages } : undefined,
    };
  } catch (err) {
    console.error("[generatePrintDocxAction]", err);
    return { ok: false, error: "Hujjat tayyorlashda xatolik" };
  }
}
