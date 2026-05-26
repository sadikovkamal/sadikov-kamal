import { Packer } from "docx";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { buildDocx } from "@/lib/print/docx";
import { normalizeImageForDocx } from "@/lib/print/image-normalize";
import { fetchImageBytesBatch } from "@/lib/print/r2-fetch";
import { printConfigSchema } from "@/lib/print/types";
import { getProblemsForPrint } from "@/lib/problems/queries";

import { BULK_OP_LIMIT } from "@/app/admin/problems/_constants";

/**
 * POST /api/admin/problems/print-docx
 *
 * Generates a .docx worksheet for the given ordered problem IDs and
 * returns the binary payload directly. Replaces the prior
 * `generatePrintDocxAction` server action so we are no longer constrained
 * by the ~4.5 MB server-action response budget on Vercel — a 25-problem
 * bundle with embedded images can easily exceed that, and exceeding the
 * budget made the whole call fail with a generic "Hujjat tayyorlashda
 * xatolik" message because the binary was being shipped back through the
 * server-action multipart envelope.
 *
 * Auth: `requireAdmin()` mirrors the action's gate exactly. No public
 * exposure — the worksheet may reveal problems that haven't been
 * published yet.
 *
 * Errors come back as `application/json` so the dialog can display the
 * server-reported reason. Success comes back as the docx bytes plus the
 * generated filename via Content-Disposition; image-fetch failure
 * counts piggy-back on a custom `X-Print-Failed-Images` header so the
 * dialog can still surface the "n ta rasm yuklanmadi" banner.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Input schema — kept in lockstep with the legacy action's schema so old
// clients (cached JS) don't quietly send a body the server can't read.
// ---------------------------------------------------------------------------

const idsSchema = z
  .array(z.string().uuid())
  .min(1)
  .max(BULK_OP_LIMIT);

const bodySchema = z
  .object({
    orderedIds: idsSchema,
    config: printConfigSchema,
  })
  .strict();

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    await requireAdmin();
  } catch {
    // requireAdmin throws/redirects for unauthenticated users — convert
    // the exception into a plain 401 so a fetch caller sees something
    // sensible. (The dialog should never hit this path because the page
    // itself is admin-only, but defence in depth.)
    return jsonError(401, "Tizimga kirilmagan");
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError(400, "Noto'g'ri so'rov tanasi");
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid input");
  }

  try {
    const problems = await getProblemsForPrint(parsed.data.orderedIds);
    if (problems.length === 0) {
      return jsonError(404, "Hech qanday masala topilmadi");
    }

    // Collect every referenced storage key. `fetchImageBytesBatch`
    // de-duplicates internally so we don't waste R2 round-trips on
    // problems that share an image.
    const storageKeys = problems.flatMap((p) =>
      p.images.map((img) => img.storageKey),
    );
    const batchResult = await fetchImageBytesBatch(storageKeys, {
      concurrency: 10,
    });

    // Re-key by URL because the markdown body references images by the
    // public URL, not by storage key. Pipe everything through the
    // normaliser so WEBP/AVIF/HEIC bytes are converted to PNG before
    // they reach `docx` — see `image-normalize.ts` for the rationale.
    const imagesByUrl = new Map<string, { bytes: Uint8Array; mime: string }>();
    let conversionFailures = 0;
    for (const problem of problems) {
      for (const img of problem.images) {
        const rawBytes = batchResult.results.get(img.storageKey);
        if (!rawBytes) continue;
        const normalised = await normalizeImageForDocx(rawBytes);
        if (!normalised) {
          conversionFailures += 1;
          continue;
        }
        imagesByUrl.set(img.url, normalised);
      }
    }

    const failedImages = batchResult.failures.size + conversionFailures;

    const doc = buildDocx(problems, parsed.data.config, imagesByUrl);
    const buffer = await Packer.toBuffer(doc);

    const filename = `masalalar-${new Date().toISOString().slice(0, 10)}.docx`;

    // Slice a fresh, standalone ArrayBuffer out of the (possibly pooled)
    // Node Buffer. Two reasons:
    //   1. `Response` needs a `BodyInit`; under recent TS lib types,
    //      `Uint8Array<ArrayBufferLike>` doesn't satisfy that because
    //      the generic admits `SharedArrayBuffer` which `BodyInit`
    //      rejects. A bare `ArrayBuffer` slice is unambiguous.
    //   2. Node `Buffer` instances are views over a shared internal
    //      allocator pool — passing the view directly would expose
    //      unrelated bytes if the consumer ever serialised the whole
    //      underlying buffer.
    const bodyBytes = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;

    return new Response(bodyBytes, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "private, no-store",
        "X-Print-Filename": filename,
        "X-Print-Failed-Images": String(failedImages),
      },
    });
  } catch (err) {
    // Log the actual error so it shows up in Vercel runtime logs — the
    // user-facing message stays generic to avoid leaking internals.
    console.error("[print-docx] generation failed", err);
    return jsonError(500, "Hujjat tayyorlashda xatolik");
  }
}
