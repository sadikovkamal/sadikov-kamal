import "server-only";

import { db } from "@/db";
import { sources, topics, ageCategories } from "@/db/schema";
import { BUNDLE_LIMITS, problemFrontmatterSchema, type ProblemFrontmatter } from "./schema";
import { parentIdSet } from "@/lib/taxonomy/hierarchy";
import type { ParsedBundle, ParsedProblem } from "./parse";

export interface ProblemValidation {
  index: number;
  sourcePath: string;
  status: "ok" | "error";
  /** Resolved frontmatter when status === "ok". */
  frontmatter: ProblemFrontmatter | null;
  /** Resolved DB UUIDs for the codes — populated only when status === "ok". */
  resolved: {
    sourceId: string;
    ageCategoryIds: string[];
    topicIds: string[];
  } | null;
  errors: string[];
}

export interface ValidationReport {
  bundleErrors: string[];
  problems: ProblemValidation[];
  okCount: number;
  errorCount: number;
}

/**
 * Validate every problem in a parsed bundle. Reads taxonomy tables to
 * resolve `S######` / `A######` / `T######` codes to UUIDs; writes nothing.
 *
 * Any missing code, malformed frontmatter, empty `# Shart` body or
 * mismatched image is reported as an error against the specific problem.
 * The caller (UI / executeImportAction) decides whether any errors mean
 * the entire bundle is rejected — per the v2 product decision, it does.
 */
export async function validateBundle(
  bundle: ParsedBundle
): Promise<ValidationReport> {
  const imageNames = new Set(bundle.images.keys());

  const [allSources, allTopics, allAgeCategories] = await Promise.all([
    db
      .select({
        id: sources.id,
        code: sources.code,
        parentId: sources.parentId,
      })
      .from(sources),
    db
      .select({
        id: topics.id,
        code: topics.code,
        parentId: topics.parentId,
      })
      .from(topics),
    db
      .select({ id: ageCategories.id, code: ageCategories.code })
      .from(ageCategories),
  ]);
  const sourceIdByCode = new Map(allSources.map((r) => [r.code, r.id]));
  const topicIdByCode = new Map(allTopics.map((r) => [r.code, r.id]));
  const ageCategoryIdByCode = new Map(
    allAgeCategories.map((r) => [r.code, r.id])
  );
  const sourceParents = parentIdSet(allSources);
  const topicParents = parentIdSet(allTopics);

  const result: ProblemValidation[] = bundle.problems.map((p) =>
    validateProblem(
      p,
      sourceIdByCode,
      ageCategoryIdByCode,
      topicIdByCode,
      sourceParents,
      topicParents,
      imageNames
    )
  );

  return {
    bundleErrors: bundle.bundleErrors,
    problems: result,
    okCount: result.filter((p) => p.status === "ok").length,
    errorCount: result.filter((p) => p.status === "error").length,
  };
}

function validateProblem(
  parsed: ParsedProblem,
  sourceIdByCode: Map<string, string>,
  ageCategoryIdByCode: Map<string, string>,
  topicIdByCode: Map<string, string>,
  sourceParents: Set<string>,
  topicParents: Set<string>,
  imageNames: Set<string>
): ProblemValidation {
  const errors: string[] = [];

  // 1. Frontmatter shape.
  const parsedFm = problemFrontmatterSchema.safeParse(parsed.rawFrontmatter ?? {});
  if (!parsedFm.success) {
    return {
      index: parsed.index,
      sourcePath: parsed.sourcePath,
      status: "error",
      frontmatter: null,
      resolved: null,
      errors: parsedFm.error.issues.map((i) => {
        const path = i.path.length > 0 ? i.path.join(".") : "(frontmatter)";
        return `${path}: ${i.message}`;
      }),
    };
  }
  const fm = parsedFm.data;

  // 2. Body.
  if (!parsed.bodyMd.trim()) {
    errors.push("Masala matni bo'sh (# Shart sarlavhasi yo'q?)");
  }

  // 3. Image count and existence.
  if (parsed.imageRefs.length > BUNDLE_LIMITS.maxImagesPerProblem) {
    errors.push(
      `Har bir masalada eng ko'pi bilan ${BUNDLE_LIMITS.maxImagesPerProblem} ta rasm bo'lishi mumkin (topildi: ${parsed.imageRefs.length})`
    );
  }
  for (const ref of parsed.imageRefs) {
    if (!imageNames.has(ref)) {
      errors.push(`Rasm arxivda yo'q: images/${ref}`);
    }
  }

  // 4. Resolve codes to UUIDs, then reject any parent (non-leaf) target.
  const sourceId = sourceIdByCode.get(fm.source);
  if (!sourceId) {
    errors.push(`Manba topilmadi: ${fm.source}`);
  } else if (sourceParents.has(sourceId)) {
    errors.push(
      `Manba parent guruh: ${fm.source} (faqat ichki manba tanlanadi)`
    );
  }

  const ageCategoryIds: string[] = [];
  for (const code of fm.age_categories) {
    const id = ageCategoryIdByCode.get(code);
    if (id) ageCategoryIds.push(id);
    else errors.push(`Yosh toifasi topilmadi: ${code}`);
  }

  const topicIds: string[] = [];
  for (const code of fm.topics) {
    const id = topicIdByCode.get(code);
    if (!id) {
      errors.push(`Mavzu topilmadi: ${code}`);
      continue;
    }
    if (topicParents.has(id)) {
      errors.push(
        `Mavzu parent guruh: ${code} (faqat ichki mavzu tanlanadi)`
      );
      continue;
    }
    topicIds.push(id);
  }

  if (errors.length > 0) {
    return {
      index: parsed.index,
      sourcePath: parsed.sourcePath,
      status: "error",
      frontmatter: fm,
      resolved: null,
      errors,
    };
  }

  return {
    index: parsed.index,
    sourcePath: parsed.sourcePath,
    status: "ok",
    frontmatter: fm,
    resolved: {
      sourceId: sourceId!,
      ageCategoryIds,
      topicIds,
    },
    errors: [],
  };
}
