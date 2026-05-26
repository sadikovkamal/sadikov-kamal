/**
 * Cap on how many problems can be processed by a single bulk action
 * (delete or update). The number is shared between the client UI (so
 * the buttons can disable + a warning can render before the user
 * clicks) and the server action schemas (so a tampered client can't
 * push past it). Keep them in lock-step by importing from here on
 * both sides.
 */
export const BULK_OP_LIMIT = 500;

/**
 * Cap on how many problems can be sent to the .docx print pipeline in
 * one request. Strictly lower than {@link BULK_OP_LIMIT} because print
 * is the most expensive bulk action by an order of magnitude:
 *
 *   - per-problem R2 image fetches (10-way concurrency)
 *   - sharp WEBP/AVIF/HEIC -> PNG normalisation
 *   - per-formula MathJax + mathml2omml conversion
 *   - docx Packer XML serialisation (single-threaded)
 *
 * Vercel caps our serverless function at `maxDuration: 30s` (see
 * `vercel.json`). 100 problems sits comfortably under that ceiling on
 * realistic problem sets; pushing higher risks platform timeouts that
 * surface as opaque 504s rather than a clean user-facing error.
 *
 * Mirrors {@link BULK_OP_LIMIT}'s shared-between-client-and-server
 * contract — the toolbar disables the Print button at this threshold
 * and the route handler / loader schemas reject larger batches.
 */
export const PRINT_LIMIT = 100;
