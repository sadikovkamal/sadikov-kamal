import { z } from "zod";

/**
 * Mirrors `docs/format-spec.md` v1. If you change a rule there, update it
 * here in the same patch.
 *
 * The schema accepts merged input where manifest defaults have already
 * been overlaid by the parser, so optional fields like `year` aren't
 * required at the type level — but the validator can additionally
 * require them for "ok" status.
 *
 * Display names for auto-created sources/topics are derived from the
 * slug at execute time (`"imo-shortlist"` → `"Imo Shortlist"`); admins
 * rename them via the taxonomy CRUD pages after import.
 */
export const problemFrontmatterSchema = z.object({
  source: z.string().min(1).max(100),
  year: z.number().int().min(1900).max(2100).optional(),
  problem_number: z
    .union([z.string(), z.number()])
    .transform((v) => String(v))
    .pipe(z.string().min(1).max(50))
    .optional(),
  // Single-select in the UI; import enforces exactly one to stay aligned.
  // The DB junction (problem_classes) keeps the many-to-many shape so the
  // UI can broaden later without a migration or import-format break.
  classes: z
    .array(z.number().int().min(5).max(11))
    .length(1, "Exactly one class required"),
  topics: z.array(z.string().min(1)).min(1),
  answer: z.string().optional(),
});

export type ProblemFrontmatter = z.infer<typeof problemFrontmatterSchema>;

export const manifestSchema = z.object({
  format_version: z.literal(1).optional(),
  batch_name: z.string().optional(),
  defaults: z
    .object({
      source: z.string().optional(),
      year: z.number().int().optional(),
      // Same single-class rule as per-problem frontmatter — manifest
      // defaults must also be a one-element array.
      classes: z.array(z.number().int()).length(1).optional(),
      topics: z.array(z.string()).optional(),
    })
    .optional(),
});

export type Manifest = z.infer<typeof manifestSchema>;

/** Bundle-wide caps from the spec. Pulled here so parse.ts and the UI
 *  share the same numbers. */
export const BUNDLE_LIMITS = {
  maxBytes: 50 * 1024 * 1024,
  maxProblems: 200,
  maxImageBytes: 5 * 1024 * 1024,
} as const;
