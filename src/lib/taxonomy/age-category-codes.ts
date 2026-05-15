/**
 * Age-category identifier conventions.
 *
 * Mirror of `topic-codes.ts` but for the flat `age_categories` taxonomy.
 * Age categories don't nest, so there's no path computation — only a
 * stable `code` (A######) plus a numeric `sortOrder` for display order
 * (1-sinf < 2-sinf < … < 11-sinf < Talaba).
 *
 * The internal UUID `id` still drives joins; `code` is the human handle
 * referenced in conversation ("masalan, A000012" = Talaba).
 */

export const AGE_CATEGORY_CODE_PREFIX = "A";
export const AGE_CATEGORY_CODE_PAD = 6;
export const AGE_CATEGORY_CODE_REGEX = /^A\d{6,}$/;

export function formatAgeCategoryCode(seq: number): string {
  return `${AGE_CATEGORY_CODE_PREFIX}${String(seq).padStart(
    AGE_CATEGORY_CODE_PAD,
    "0"
  )}`;
}

export function parseAgeCategoryCodeSeq(code: string): number {
  if (!AGE_CATEGORY_CODE_REGEX.test(code)) return Number.NaN;
  return Number.parseInt(code.slice(AGE_CATEGORY_CODE_PREFIX.length), 10);
}

/**
 * Next sequential code given the existing set. The DB has a UNIQUE
 * constraint on `code`, so racing creates surface as a constraint error
 * rather than collisions — we don't pre-lock.
 */
export function nextAgeCategoryCode(existingCodes: string[]): string {
  let max = 0;
  for (const code of existingCodes) {
    const n = parseAgeCategoryCodeSeq(code);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return formatAgeCategoryCode(max + 1);
}
