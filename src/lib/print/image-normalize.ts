import "server-only";

import sharp from "sharp";

/**
 * Normalise an image's bytes + MIME into a form the `docx` library can
 * embed cleanly.
 *
 * Background: `docx@9.7` only accepts `"jpg" | "png" | "gif" | "bmp"` as
 * the `ImageRun` `type`. When we shipped WEBP bytes — declared as PNG so
 * the upstream type check stayed happy — Word refused to open the file:
 *
 *     "Word experienced an error trying to open the file."
 *
 * Word reads the bytes against the relationship's content type and
 * rejects the entire document when they don't match. The fix is to
 * convert anything docx can't natively carry (WEBP, AVIF, SVG, …) into
 * PNG before assembly.
 *
 * We sniff the bytes themselves rather than trusting the storage-key
 * extension or the table's `mime_type` column — both could be wrong if a
 * user renamed a file on upload or the bucket auto-converted on PUT.
 */

export type DocxImageMime =
  | "image/png"
  | "image/jpeg"
  | "image/gif"
  | "image/bmp";

const DOCX_NATIVE_MIMES: ReadonlySet<DocxImageMime> = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/bmp",
]);

/**
 * Inspect the first dozen bytes to figure out the file's actual format.
 * Returns `null` when no signature matches; the caller should treat that
 * as "unknown" and route through sharp to normalise.
 */
export function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  // JPEG: starts with FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // GIF: 47 49 46 38 (GIF8)
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return "image/gif";
  }
  // BMP: 42 4D (BM)
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return "image/bmp";
  }
  // WEBP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  // AVIF / HEIC: bytes 4..11 are "ftyp" followed by a brand (avif / heic /
  // mif1 / ...). We only need to distinguish them from the formats above.
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(
      bytes[8] ?? 0,
      bytes[9] ?? 0,
      bytes[10] ?? 0,
      bytes[11] ?? 0,
    );
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (brand.startsWith("heic") || brand.startsWith("heix")) {
      return "image/heic";
    }
  }
  return null;
}

/**
 * Convert the input bytes to a format the docx library can embed.
 *
 * Returns the (possibly identical) byte buffer plus the canonical MIME.
 * For unsupported formats we run sharp's PNG encoder. If sharp throws
 * (corrupt source, unsupported codec on the host), returns `null` so the
 * caller can substitute a placeholder paragraph rather than embedding
 * something Word will reject.
 */
export async function normalizeImageForDocx(
  bytes: Uint8Array,
): Promise<{ bytes: Uint8Array; mime: DocxImageMime } | null> {
  const sniffed = sniffImageMime(bytes);
  if (sniffed && DOCX_NATIVE_MIMES.has(sniffed as DocxImageMime)) {
    return { bytes, mime: sniffed as DocxImageMime };
  }
  // Unknown or known-unsupported (WEBP, AVIF, HEIC, …). Pipe through
  // sharp's PNG encoder. We disable animation handling — WEBP animations
  // would collapse to the first frame, which is the right behaviour for
  // a printable worksheet.
  try {
    const buffer = await sharp(bytes, { animated: false }).png().toBuffer();
    return { bytes: new Uint8Array(buffer), mime: "image/png" };
  } catch (err) {
    console.warn(
      "[normalizeImageForDocx] sharp could not decode image:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
