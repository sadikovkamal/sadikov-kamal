import "server-only";

import katex from "katex";
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
import { withDescendants } from "@/lib/taxonomy/hierarchy";

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
  /** S###### codes; filter expands to descendants when a parent code is given. */
  sourceCodes?: string[];
  /** A###### codes. Age categories are flat — no expansion. */
  ageCategoryCodes?: string[];
  /** T###### codes; filter expands to descendants when a parent code is given. */
  topicCodes?: string[];
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

export interface ProblemListTopic {
  id: string;
  code: string;
  name: string;
}

export interface ProblemListRow {
  id: string;
  code: string;
  bodyPreview: string;
  /** Source code (e.g. `S000001`) — null when the source row vanished. */
  sourceCode: string | null;
  sourceName: string;
  createdAt: Date;
  topics: ProblemListTopic[];
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
  // Source filter — expand to descendants on the SQL side. We need
  // (id, parentId) for the topology and (code, id) for the resolution,
  // so a single read with all three columns covers both.
  if (filters.sourceCodes?.length) {
    const allSources = await db
      .select({
        id: sources.id,
        code: sources.code,
        parentId: sources.parentId,
      })
      .from(sources);
    const idByCode = new Map(allSources.map((s) => [s.code, s.id]));
    const seedIds = filters.sourceCodes
      .map((c) => idByCode.get(c))
      .filter((id): id is string => id != null);
    if (seedIds.length > 0) {
      const expanded = withDescendants(seedIds, allSources);
      conds.push(inArray(problems.sourceId, expanded));
    }
  }

  // Age category filter — flat, no expansion. Translate code -> id with
  // a subquery so codes flow straight through.
  if (filters.ageCategoryCodes?.length) {
    conds.push(
      exists(
        db
          .select({ one: sql<number>`1` })
          .from(problemAgeCategories)
          .innerJoin(
            ageCategories,
            eq(ageCategories.id, problemAgeCategories.ageCategoryId)
          )
          .where(
            and(
              eq(problemAgeCategories.problemId, problems.id),
              inArray(ageCategories.code, filters.ageCategoryCodes)
            )
          )
      )
    );
  }

  // Topic filter — expand to descendants like sources do.
  if (filters.topicCodes?.length) {
    const allTopics = await db
      .select({
        id: topics.id,
        code: topics.code,
        parentId: topics.parentId,
      })
      .from(topics);
    const idByCode = new Map(allTopics.map((t) => [t.code, t.id]));
    const seedIds = filters.topicCodes
      .map((c) => idByCode.get(c))
      .filter((id): id is string => id != null);
    if (seedIds.length > 0) {
      const expanded = withDescendants(seedIds, allTopics);
      conds.push(
        exists(
          db
            .select({ one: sql<number>`1` })
            .from(problemTopics)
            .where(
              and(
                eq(problemTopics.problemId, problems.id),
                inArray(problemTopics.topicId, expanded)
              )
            )
        )
      );
    }
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
      sourceCode: sources.code,
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

  // Hydrate topics (id+code+name for chip links) + age categories in
  // two batched queries.
  const ids = rows.map((r) => r.id);
  const [topicRows, ageCategoryRows] = await Promise.all([
    db
      .select({
        problemId: problemTopics.problemId,
        id: topics.id,
        code: topics.code,
        name: topics.name,
      })
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

  const topicsByProblem = new Map<string, ProblemListTopic[]>();
  for (const r of topicRows) {
    const arr = topicsByProblem.get(r.problemId) ?? [];
    arr.push({ id: r.id, code: r.code, name: r.name });
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
      sourceCode: r.sourceCode,
      sourceName: r.sourceName ?? "—",
      createdAt: r.createdAt,
      topics: topicsByProblem.get(r.id) ?? [],
      ageCategories: (ageCategoriesByProblem.get(r.id) ?? []).sort((a, b) =>
        a.code.localeCompare(b.code)
      ),
    })),
    total,
  };
}

/**
 * Build an HTML preview for a markdown problem body.
 *
 * Strips images / headings / emphasis / link URLs (keeping link text),
 * collapses whitespace, truncates the visible-text source to `maxLen`,
 * then KaTeX-renders inline math (`$...$`) and block math (`$$...$$`,
 * displayed inline here since it's a one-line preview). All non-math
 * text is HTML-escaped, so the result is safe to drop into the DOM via
 * `dangerouslySetInnerHTML`. KaTeX's own output is curated HTML+MathML
 * and is trusted as-is.
 *
 * Why server-side: katex.renderToString runs anywhere; doing it here
 * keeps the list page client bundle free of react-markdown + plugins.
 * The `katex.min.css` is loaded by the problems segment layout, so the
 * rendered output styles correctly on every problem-related route.
 */
function stripMarkdownToPreview(md: string, maxLen: number): string {
  // 1. Strip non-math markdown. We keep math delimiters intact for the
  //    next phase; the regexes below avoid the $...$ runs.
  const cleaned = md
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "[rasm]")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // 2. Truncate while math tokens are still visible-as-source. We do
  //    a rough char count that treats each $expr$ as the length of its
  //    rendered text equivalent ≈ source length — close enough for a
  //    one-line preview budget. If the cut lands inside a $...$ run,
  //    strip back to before the unmatched $ — otherwise the tokenizer
  //    in step 3 leaves an unpaired $ as literal text and the preview
  //    shows raw "$ABC…" instead of the rendered ABC.
  const truncated =
    cleaned.length > maxLen
      ? stripUnclosedMath(cleaned.slice(0, maxLen)).trimEnd() + "…"
      : cleaned;

  // 3. Tokenize on math delimiters and KaTeX-render each math token.
  //    Block math ($$...$$) renders inline here — the preview is a
  //    single line, display mode would blow it out vertically.
  //    Token regex eats either $$...$$ or $...$; "g" flag so we can
  //    interleave text + math chunks.
  const TOKEN = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  const parts: string[] = [];
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(truncated)) !== null) {
    if (m.index > cursor) {
      parts.push(escapeHtml(truncated.slice(cursor, m.index)));
    }
    const expr = m[1] ?? m[2] ?? "";
    parts.push(renderMathInline(expr));
    cursor = m.index + m[0].length;
  }
  if (cursor < truncated.length) {
    parts.push(escapeHtml(truncated.slice(cursor)));
  }
  return parts.join("");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * If `s` ends with an unmatched math-opening `$`, strip back to before
 * it. Walks the string once and toggles an "are we inside math?" flag
 * each time it sees `$`; if the flag is still on at the end, returns
 * `s.slice(0, openingIdx)`. Idempotent on already-balanced strings.
 * Block math (`$$ ... $$`) is treated as two single `$`s — the inner
 * toggling cancels out so balanced `$$...$$` is left alone, and a
 * partial `$$ABC` correctly strips back to before the first `$`.
 */
function stripUnclosedMath(s: string): string {
  let openIdx = -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "$") {
      openIdx = openIdx === -1 ? i : -1;
    }
  }
  return openIdx === -1 ? s : s.slice(0, openIdx);
}

function renderMathInline(expr: string): string {
  try {
    return katex.renderToString(expr, {
      throwOnError: false,
      displayMode: false,
      output: "html",
    });
  } catch {
    return escapeHtml(expr);
  }
}
