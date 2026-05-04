import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { sources, topics, problems } from "@/db/schema";
import {
  problemFrontmatterSchema,
  type Manifest,
  type ProblemFrontmatter,
} from "./schema";
import type { ParsedBundle, ParsedProblem } from "./parse";

export interface ProblemValidation {
  index: number;
  sourcePath: string;
  status: "ok" | "warning" | "error";
  frontmatter: ProblemFrontmatter | null;
  errors: string[];
  warnings: string[];
  /** True if a duplicate already exists in the DB. */
  isDuplicate: boolean;
  /** Slugs that don't exist yet (will be auto-created on execute). */
  newSources: string[];
  newTopics: string[];
}

export interface ValidationReport {
  bundleErrors: string[];
  problems: ProblemValidation[];
  okCount: number;
  warningCount: number;
  errorCount: number;
}

/**
 * Validate every problem in a parsed bundle. Pure-ish: reads from the DB
 * (sources, topics, duplicate check) but writes nothing.
 */
export async function validateBundle(
  bundle: ParsedBundle
): Promise<ValidationReport> {
  const imageNames = new Set(bundle.images.keys());

  // Pre-fetch slug lookups in one round trip each.
  const [allSources, allTopics] = await Promise.all([
    db.select({ slug: sources.slug }).from(sources),
    db.select({ slug: topics.slug }).from(topics),
  ]);
  const sourceSlugs = new Set(allSources.map((r) => r.slug));
  const topicSlugs = new Set(allTopics.map((r) => r.slug));

  const result: ProblemValidation[] = [];
  for (const p of bundle.problems) {
    const v = await validateProblem(
      p,
      bundle.manifest,
      sourceSlugs,
      topicSlugs,
      imageNames
    );
    result.push(v);
  }

  return {
    bundleErrors: bundle.bundleErrors,
    problems: result,
    okCount: result.filter((p) => p.status === "ok").length,
    warningCount: result.filter((p) => p.status === "warning").length,
    errorCount: result.filter((p) => p.status === "error").length,
  };
}

async function validateProblem(
  parsed: ParsedProblem,
  manifest: Manifest | null,
  existingSourceSlugs: Set<string>,
  existingTopicSlugs: Set<string>,
  imageNames: Set<string>
): Promise<ProblemValidation> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Merge manifest defaults under the problem's frontmatter.
  const defaults = manifest?.defaults ?? {};
  const rawFm = parsed.rawFrontmatter ?? {};
  const merged: Record<string, unknown> = {
    ...defaults,
    ...rawFm,
  };

  // 2. Validate against the schema.
  const parsedFm = problemFrontmatterSchema.safeParse(merged);
  if (!parsedFm.success) {
    return {
      index: parsed.index,
      sourcePath: parsed.sourcePath,
      status: "error",
      frontmatter: null,
      errors: parsedFm.error.issues.map((i) => {
        const path = i.path.length > 0 ? i.path.join(".") : "(root)";
        return `${path}: ${i.message}`;
      }),
      warnings: [],
      isDuplicate: false,
      newSources: [],
      newTopics: [],
    };
  }

  const fm = parsedFm.data;

  // 3. Body must not be empty (or # Shart was missing).
  if (!parsed.bodyMd.trim()) {
    errors.push("Problem body is empty (missing # Shart section?)");
  }

  // 4. Every image ref must exist in the bundle.
  for (const ref of parsed.imageRefs) {
    if (!imageNames.has(ref)) {
      errors.push(`Image not in bundle: images/${ref}`);
    }
  }

  // 5. Track auto-creations (warnings, not errors — execute will create them).
  const newSources: string[] = [];
  const newTopics: string[] = [];
  if (!existingSourceSlugs.has(fm.source)) {
    newSources.push(fm.source);
    warnings.push(`Source "${fm.source}" will be auto-created`);
  }
  for (const t of fm.topics) {
    if (!existingTopicSlugs.has(t)) {
      newTopics.push(t);
      warnings.push(`Topic "${t}" will be auto-created`);
    }
  }

  // 6. Duplicate check (warning, not error — execute will skip).
  let isDuplicate = false;
  if (fm.year != null && fm.problem_number != null) {
    const srcRow = await db.query.sources.findFirst({
      where: eq(sources.slug, fm.source),
    });
    if (srcRow) {
      const dup = await db.query.problems.findFirst({
        where: and(
          eq(problems.sourceId, srcRow.id),
          eq(problems.year, fm.year),
          eq(problems.problemNumber, fm.problem_number)
        ),
      });
      if (dup) {
        isDuplicate = true;
        warnings.push(
          `Duplicate of an existing problem (same source/year/number) — will be skipped`
        );
      }
    }
  }

  const status: ProblemValidation["status"] =
    errors.length > 0 ? "error" : warnings.length > 0 ? "warning" : "ok";

  return {
    index: parsed.index,
    sourcePath: parsed.sourcePath,
    status,
    frontmatter: fm,
    errors,
    warnings,
    isDuplicate,
    newSources,
    newTopics,
  };
}
