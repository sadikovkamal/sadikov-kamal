import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  exists,
  gte,
  inArray,
  lte,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db";
import {
  problems,
  problemTopics,
  problemClasses,
  images,
  topics,
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

  const [topicRows, classRows, source, imageRows] = await Promise.all([
    db
      .select({ id: topics.id, name: topics.name, slug: topics.slug })
      .from(problemTopics)
      .innerJoin(topics, eq(topics.id, problemTopics.topicId))
      .where(eq(problemTopics.problemId, id)),
    db
      .select({ classNumber: problemClasses.classNumber })
      .from(problemClasses)
      .where(eq(problemClasses.problemId, id)),
    db.query.sources.findFirst({ where: eq(sources.id, problem.sourceId) }),
    db.query.images.findMany({ where: eq(images.problemId, id) }),
  ]);

  return {
    ...problem,
    topics: topicRows,
    classes: classRows.map((r) => r.classNumber),
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
  yearFrom?: number;
  yearTo?: number;
  classes?: number[];
  topicIds?: string[];
}

export interface ProblemListSort {
  field: "createdAt" | "year";
  direction: "asc" | "desc";
}

export interface ProblemListRow {
  id: string;
  bodyPreview: string;
  sourceName: string;
  year: number | null;
  problemNumber: string | null;
  createdAt: Date;
  topicNames: string[];
  classes: number[];
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
  if (filters.yearFrom !== undefined) {
    conds.push(gte(problems.year, filters.yearFrom));
  }
  if (filters.yearTo !== undefined) {
    conds.push(lte(problems.year, filters.yearTo));
  }
  if (filters.classes?.length) {
    conds.push(
      exists(
        db
          .select({ one: sql<number>`1` })
          .from(problemClasses)
          .where(
            and(
              eq(problemClasses.problemId, problems.id),
              inArray(problemClasses.classNumber, filters.classes)
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
    sort.field === "year" ? problems.year : problems.createdAt;
  const orderBy = sort.direction === "asc" ? asc(orderColumn) : desc(orderColumn);

  // Count
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(problems)
    .where(whereClause);
  const total = countResult[0]?.count ?? 0;

  // Page
  const rows = await db
    .select({
      id: problems.id,
      bodyMd: problems.bodyMd,
      year: problems.year,
      problemNumber: problems.problemNumber,
      createdAt: problems.createdAt,
      sourceName: sources.name,
    })
    .from(problems)
    .leftJoin(sources, eq(sources.id, problems.sourceId))
    .where(whereClause)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset(Math.max(0, (page - 1) * pageSize));

  if (rows.length === 0) return { rows: [], total };

  // Hydrate topic names + classes in two batched queries.
  const ids = rows.map((r) => r.id);
  const [topicRows, classRows] = await Promise.all([
    db
      .select({ problemId: problemTopics.problemId, topicName: topics.name })
      .from(problemTopics)
      .innerJoin(topics, eq(topics.id, problemTopics.topicId))
      .where(inArray(problemTopics.problemId, ids)),
    db
      .select({
        problemId: problemClasses.problemId,
        classNumber: problemClasses.classNumber,
      })
      .from(problemClasses)
      .where(inArray(problemClasses.problemId, ids)),
  ]);

  const topicsByProblem = new Map<string, string[]>();
  for (const r of topicRows) {
    const arr = topicsByProblem.get(r.problemId) ?? [];
    arr.push(r.topicName);
    topicsByProblem.set(r.problemId, arr);
  }
  const classesByProblem = new Map<string, number[]>();
  for (const r of classRows) {
    const arr = classesByProblem.get(r.problemId) ?? [];
    arr.push(r.classNumber);
    classesByProblem.set(r.problemId, arr);
  }

  return {
    rows: rows.map((r) => ({
      id: r.id,
      bodyPreview: stripMarkdownToPreview(r.bodyMd, 140),
      sourceName: r.sourceName ?? "—",
      year: r.year,
      problemNumber: r.problemNumber,
      createdAt: r.createdAt,
      topicNames: topicsByProblem.get(r.id) ?? [],
      classes: (classesByProblem.get(r.id) ?? []).sort((a, b) => a - b),
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
