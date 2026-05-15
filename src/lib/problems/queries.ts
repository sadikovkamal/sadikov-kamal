import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  exists,
  inArray,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db";
import {
  problems,
  problemTopics,
  problemAgeCategories,
  images,
  topics,
  ageCategories,
  sources,
} from "@/db/schema";

/**
 * Fetch a single problem with all its associations expanded.
 * Returns null if no row exists. Joins are parallelized.
 */
export async function getProblemById(id: string) {
  const problem = await db.query.problems.findFirst({
    where: eq(problems.id, id),
  });
  if (!problem) return null;

  const [topicRows, ageCategoryRows, source, imageRows] = await Promise.all([
    db
      .select({ id: topics.id, code: topics.code, name: topics.name })
      .from(problemTopics)
      .innerJoin(topics, eq(topics.id, problemTopics.topicId))
      .where(eq(problemTopics.problemId, id)),
    db
      .select({
        id: ageCategories.id,
        code: ageCategories.code,
        name: ageCategories.name,
      })
      .from(problemAgeCategories)
      .innerJoin(
        ageCategories,
        eq(ageCategories.id, problemAgeCategories.ageCategoryId)
      )
      .where(eq(problemAgeCategories.problemId, id))
      .orderBy(ageCategories.code),
    db.query.sources.findFirst({ where: eq(sources.id, problem.sourceId) }),
    db.query.images.findMany({ where: eq(images.problemId, id) }),
  ]);

  return {
    ...problem,
    topics: topicRows,
    ageCategories: ageCategoryRows,
    source,
    images: imageRows,
  };
}

export type ProblemWithRelations = NonNullable<
  Awaited<ReturnType<typeof getProblemById>>
>;

// --- List page query --------------------------------------------------------

export interface ProblemListFilters {
  search?: string;
  sourceIds?: string[];
  ageCategoryIds?: string[];
  topicIds?: string[];
}

export interface ProblemListSort {
  field: "createdAt" | "code";
  direction: "asc" | "desc";
}

export interface ProblemListAgeCategory {
  id: string;
  code: string;
  name: string;
}

export interface ProblemListRow {
  id: string;
  code: string;
  bodyPreview: string;
  sourceName: string;
  createdAt: Date;
  topicNames: string[];
  ageCategories: ProblemListAgeCategory[];
}

export interface ProblemListResult {
  rows: ProblemListRow[];
  total: number;
}

/**
 * Listing query with filters, FTS search, sort, and pagination.
 *
 * - Search uses `to_tsvector('simple', body_md) @@ websearch_to_tsquery(...)`
 *   which lines up with the GIN index `problems_body_fts_idx` from Phase 1.
 * - Class/topic/tag filters use EXISTS-subqueries via Drizzle's `exists()`
 *   helper so a single problem with multiple matching junctions doesn't
 *   produce duplicate rows.
 * - Hydration of topicNames/classes is one extra query each, batched by
 *   `inArray` over the page's IDs — cost is O(2) regardless of pageSize.
 */
export async function listProblems(
  filters: ProblemListFilters,
  sort: ProblemListSort,
  page: number,
  pageSize: number
): Promise<ProblemListResult> {
  const conds: SQL[] = [];

  if (filters.search?.trim()) {
    conds.push(
      sql`to_tsvector('simple', ${problems.bodyMd}) @@ websearch_to_tsquery('simple', ${filters.search})`
    );
  }
  if (filters.sourceIds?.length) {
    conds.push(inArray(problems.sourceId, filters.sourceIds));
  }
  if (filters.ageCategoryIds?.length) {
    conds.push(
      exists(
        db
          .select({ one: sql<number>`1` })
          .from(problemAgeCategories)
          .where(
            and(
              eq(problemAgeCategories.problemId, problems.id),
              inArray(
                problemAgeCategories.ageCategoryId,
                filters.ageCategoryIds
              )
            )
          )
      )
    );
  }
  if (filters.topicIds?.length) {
    conds.push(
      exists(
        db
          .select({ one: sql<number>`1` })
          .from(problemTopics)
          .where(
            and(
              eq(problemTopics.problemId, problems.id),
              inArray(problemTopics.topicId, filters.topicIds)
            )
          )
      )
    );
  }
  const whereClause = conds.length ? and(...conds) : undefined;

  const orderColumn =
    sort.field === "code" ? problems.code : problems.createdAt;
  const orderBy = sort.direction === "asc" ? asc(orderColumn) : desc(orderColumn);

  // Count + page run in parallel — Postgres handles both on the same
  // pool, and the page query is what gates render latency, so trimming
  // the count round-trip from the critical path halves p50.
  const [countResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(problems)
      .where(whereClause),
    db
    .select({
      id: problems.id,
      code: problems.code,
      bodyMd: problems.bodyMd,
      createdAt: problems.createdAt,
      sourceName: sources.name,
    })
    .from(problems)
    .leftJoin(sources, eq(sources.id, problems.sourceId))
    .where(whereClause)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset(Math.max(0, (page - 1) * pageSize)),
  ]);
  const total = countResult[0]?.count ?? 0;

  if (rows.length === 0) return { rows: [], total };

  // Hydrate topic names + age categories in two batched queries.
  const ids = rows.map((r) => r.id);
  const [topicRows, ageCategoryRows] = await Promise.all([
    db
      .select({ problemId: problemTopics.problemId, topicName: topics.name })
      .from(problemTopics)
      .innerJoin(topics, eq(topics.id, problemTopics.topicId))
      .where(inArray(problemTopics.problemId, ids)),
    db
      .select({
        problemId: problemAgeCategories.problemId,
        id: ageCategories.id,
        code: ageCategories.code,
        name: ageCategories.name,
      })
      .from(problemAgeCategories)
      .innerJoin(
        ageCategories,
        eq(ageCategories.id, problemAgeCategories.ageCategoryId)
      )
      .where(inArray(problemAgeCategories.problemId, ids)),
  ]);

  const topicsByProblem = new Map<string, string[]>();
  for (const r of topicRows) {
    const arr = topicsByProblem.get(r.problemId) ?? [];
    arr.push(r.topicName);
    topicsByProblem.set(r.problemId, arr);
  }
  const ageCategoriesByProblem = new Map<string, ProblemListAgeCategory[]>();
  for (const r of ageCategoryRows) {
    const arr = ageCategoriesByProblem.get(r.problemId) ?? [];
    arr.push({ id: r.id, code: r.code, name: r.name });
    ageCategoriesByProblem.set(r.problemId, arr);
  }

  return {
    rows: rows.map((r) => ({
      id: r.id,
      code: r.code,
      bodyPreview: stripMarkdownToPreview(r.bodyMd, 140),
      sourceName: r.sourceName ?? "—",
      createdAt: r.createdAt,
      topicNames: topicsByProblem.get(r.id) ?? [],
      ageCategories: (ageCategoriesByProblem.get(r.id) ?? []).sort((a, b) =>
        a.code.localeCompare(b.code)
      ),
    })),
    total,
  };
}

/**
 * Cheap markdown stripper for list previews. Replaces math with `[math]`,
 * collapses links to their text, drops headings/emphasis, normalizes
 * whitespace. Cheap because we don't need real markdown rendering for a
 * one-line cell — readability beats fidelity here.
 */
function stripMarkdownToPreview(md: string, maxLen: number): string {
  const stripped = md
    // Unwrap math: keep the LaTeX source visible, drop the $ markers.
    .replace(/\$\$([\s\S]*?)\$\$/g, "$1")
    .replace(/\$([^$\n]+)\$/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "[rasm]")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length > maxLen
    ? stripped.slice(0, maxLen).trimEnd() + "…"
    : stripped;
}
