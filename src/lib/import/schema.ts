import { z } from "zod";

/**
 * Frontmatter schema for the v2 bulk-import format.
 *
 * v2 ditches the legacy slug-based identifiers (and the optional
 * `manifest.yaml`) in favour of the stable codes the admin section
 * already shows: `S######` for sources, `A######` for age categories,
 * `T######` for topics. The importer never auto-creates taxonomy rows
 * anymore — if a code doesn't exist, the bundle is rejected and the
 * admin fixes it in the taxonomy CRUD pages first.
 *
 *   ---
 *   source: S000001
 *   age_categories: [A000010, A000011]
 *   topics: [T000042, T000043]
 *   ---
 *
 *   # Shart
 *   ...
 *
 * Year, problem_number, answer, solution and manifest defaults are all
 * gone — the `problems` table no longer carries year/answer/solution,
 * and codes are auto-assigned (P#######).
 */

export const SOURCE_CODE_REGEX = /^S\d{6,}$/;
export const AGE_CATEGORY_CODE_REGEX = /^A\d{6,}$/;
export const TOPIC_CODE_REGEX = /^T\d{6,}$/;

export const problemFrontmatterSchema = z.object({
  source: z
    .string()
    .regex(SOURCE_CODE_REGEX, "source must be a code like S000001"),
  age_categories: z
    .array(z.string().regex(AGE_CATEGORY_CODE_REGEX, "expected A######"))
    .min(1, "at least one age category required"),
  topics: z
    .array(z.string().regex(TOPIC_CODE_REGEX, "expected T######"))
    .min(1, "at least one topic required"),
});

export type ProblemFrontmatter = z.infer<typeof problemFrontmatterSchema>;

/** Bundle-wide caps. Pulled here so parse.ts and the UI share the numbers. */
export const BUNDLE_LIMITS = {
  maxBytes: 50 * 1024 * 1024,
  maxProblems: 200,
  maxImageBytes: 5 * 1024 * 1024,
  /** Each problem carries at most one image (mirrors the single-problem form). */
  maxImagesPerProblem: 1,
} as const;
