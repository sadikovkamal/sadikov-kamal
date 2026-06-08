/**
 * Single-image upload limit + user-facing guard.
 *
 * Manual image uploads ("Rasm yuklash", editor drag-drop) stream the file
 * through a Vercel server action, whose request body is capped at ~4.5 MB on
 * the free tier. So a single image is capped at 4 MB and we surface a clear,
 * client-side message BEFORE attempting the upload — instead of the confusing
 * generic network error a >4.5 MB file would otherwise trigger at the platform
 * boundary.
 *
 * Bulk ZIP import is NOT affected: it uploads straight to R2 via a presigned
 * PUT, bypassing Vercel entirely (cap there is the 50 MB bundle limit).
 *
 * Pure module (no I/O) — safe to import in both client and server bundles.
 */

/** Max bytes for a single manual image upload. */
export const IMAGE_MAX_BYTES = 4 * 1024 * 1024; // 4 MB
/** Same cap in MB, for messages. */
export const IMAGE_MAX_MB = 4;

/**
 * Returns an Uzbek error message if the file is too big to upload as a single
 * image, or `null` when it's within the limit.
 */
export function imageSizeError(file: { size: number }): string | null {
  if (file.size > IMAGE_MAX_BYTES) {
    return `${IMAGE_MAX_MB} MB dan ortiq hajmdagi rasmni yuklay olmaysiz.`;
  }
  return null;
}
