/**
 * Problem identifier conventions.
 *
 * Same shape as the topics/sources/age-category helpers: stable code,
 * never reused, monotonic. Difference is the padding width — problems
 * can scale to millions, so we reserve 7 digits instead of 6:
 *
 *   T000001     (topic — 6 digits)
 *   S000001     (source — 6 digits)
 *   A000001     (age category — 6 digits)
 *   P0000001    (problem — 7 digits)
 *
 * The internal UUID `id` still drives joins; `code` is what admins
 * read, search for, and reference in conversation.
 */

export const PROBLEM_CODE_PREFIX = "P";
export const PROBLEM_CODE_PAD = 7;
export const PROBLEM_CODE_REGEX = /^P\d{7,}$/;

export function formatProblemCode(seq: number): string {
  return `${PROBLEM_CODE_PREFIX}${String(seq).padStart(
    PROBLEM_CODE_PAD,
    "0"
  )}`;
}

/**
 * Pull the numeric tail out of a `P#######` code. Returns NaN when the
 * input doesn't match — callers should treat NaN as "skip".
 */
export function parseProblemCodeSeq(code: string): number {
  if (!PROBLEM_CODE_REGEX.test(code)) return Number.NaN;
  return Number.parseInt(code.slice(PROBLEM_CODE_PREFIX.length), 10);
}

// `nextProblemCode` was removed: each call site reads
// `select max(code)` itself (single round-trip) and feeds the parsed
// integer into `formatProblemCode`. See `createProblemTx` and
// `executeImport` for the inline version.
