import "server-only";

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  topics,
  sources,
  problems,
  problemTopics,
  ageCategories,
  problemAgeCategories,
} from "@/db/schema";
import type { Topic, AgeCategory, Source } from "@/db/schema";

export interface TopicWithCount {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  description: string | null;
  problemCount: number;
}

export async function listTopicsWithCounts(): Promise<TopicWithCount[]> {
  const rows = await db
    .select({
      id: topics.id,
      name: topics.name,
      slug: topics.slug,
      parentId: topics.parentId,
      description: topics.description,
      problemCount: sql<number>`(
        SELECT count(*)::int
        FROM ${problemTopics}
        WHERE ${problemTopics.topicId} = ${topics.id}
      )`,
    })
    .from(topics)
    .orderBy(topics.name);
  return rows;
}

export async function getTopicById(id: string): Promise<Topic | null> {
  const rows = await db.select().from(topics).where(eq(topics.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Direct children of a topic (one level), each with a count of problems
 * tagged directly with that child (not aggregated across grandchildren).
 */
export async function getTopicChildren(
  parentId: string
): Promise<TopicWithCount[]> {
  const rows = await db
    .select({
      id: topics.id,
      name: topics.name,
      slug: topics.slug,
      parentId: topics.parentId,
      description: topics.description,
      problemCount: sql<number>`(
        SELECT count(*)::int
        FROM ${problemTopics}
        WHERE ${problemTopics.topicId} = ${topics.id}
      )`,
    })
    .from(topics)
    .where(eq(topics.parentId, parentId))
    .orderBy(topics.name);
  return rows;
}

/**
 * Ancestor chain (root → ... → parent of the given topic). Does not include
 * the topic itself. Used for breadcrumbs. Bounded depth via cap to defend
 * against accidental cycles.
 */
export async function getTopicAncestors(id: string): Promise<Topic[]> {
  const chain: Topic[] = [];
  let cursor: string | null = id;
  const seen = new Set<string>();
  for (let i = 0; i < 16 && cursor; i++) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const current: Topic | null = await getTopicById(cursor);
    if (!current) break;
    if (i > 0) chain.unshift(current); // skip the topic itself
    cursor = current.parentId;
  }
  return chain;
}

export interface SourceWithCount {
  id: string;
  name: string;
  slug: string;
  kind: "olympiad" | "book" | "course" | "other";
  country: string | null;
  parentId: string | null;
  problemCount: number;
}

// --- Age categories ---------------------------------------------------------

export interface AgeCategoryWithCount {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  problemCount: number;
}

export async function listAgeCategoriesWithCounts(): Promise<
  AgeCategoryWithCount[]
> {
  const rows = await db
    .select({
      id: ageCategories.id,
      name: ageCategories.name,
      slug: ageCategories.slug,
      description: ageCategories.description,
      sortOrder: ageCategories.sortOrder,
      problemCount: sql<number>`(
        SELECT count(*)::int
        FROM ${problemAgeCategories}
        WHERE ${problemAgeCategories.ageCategoryId} = ${ageCategories.id}
      )`,
    })
    .from(ageCategories)
    .orderBy(ageCategories.sortOrder, ageCategories.name);
  return rows;
}

export async function getAgeCategoryById(
  id: string
): Promise<AgeCategory | null> {
  const rows = await db
    .select()
    .from(ageCategories)
    .where(eq(ageCategories.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Topics that have at least one problem tagged with the given age category.
 *
 * The "inside" relationship is derived from problem tagging: a topic appears
 * in an age category's view when at least one problem links the two. We also
 * include the topic's parents on the way up, so a parent topic shows up even
 * when only its grandchildren have direct tags. This lets the user drill in
 * naturally from parent → child within the age-category context.
 *
 * problemCount per topic is scoped: it counts only problems that share BOTH
 * the topic AND the age category.
 */
export interface TopicInAgeCategory extends TopicWithCount {
  /** Number of problems tagged with BOTH this topic and the age category. */
  scopedProblemCount: number;
}

export async function getTopicsInAgeCategory(
  ageCategoryId: string,
  parentTopicId: string | null
): Promise<TopicInAgeCategory[]> {
  // We compute the set of "reachable" topic IDs in two steps:
  // 1. Direct: topics tagged on a problem also tagged with the age category.
  // 2. Inclusive ancestors: walk parent_id upward so parents of reachable
  //    topics also show up. We do this with a recursive CTE.
  //
  // Then we filter to direct children of `parentTopicId` (or roots when null).
  const rows = await db.execute<{
    id: string;
    name: string;
    slug: string;
    parent_id: string | null;
    description: string | null;
    scoped_problem_count: number;
    problem_count: number;
  }>(sql`
    WITH RECURSIVE direct_topics AS (
      SELECT DISTINCT pt.topic_id AS id
      FROM ${problemTopics} pt
      JOIN ${problemAgeCategories} pac ON pac.problem_id = pt.problem_id
      WHERE pac.age_category_id = ${ageCategoryId}
    ),
    reachable AS (
      SELECT t.id, t.parent_id
      FROM ${topics} t
      JOIN direct_topics dt ON dt.id = t.id
      UNION
      SELECT t.id, t.parent_id
      FROM ${topics} t
      JOIN reachable r ON r.parent_id = t.id
    )
    SELECT
      t.id,
      t.name,
      t.slug,
      t.parent_id,
      t.description,
      (
        SELECT count(*)::int
        FROM ${problemTopics} pt
        JOIN ${problemAgeCategories} pac ON pac.problem_id = pt.problem_id
        WHERE pt.topic_id = t.id AND pac.age_category_id = ${ageCategoryId}
      ) AS scoped_problem_count,
      (
        SELECT count(*)::int
        FROM ${problemTopics} pt
        WHERE pt.topic_id = t.id
      ) AS problem_count
    FROM ${topics} t
    WHERE t.id IN (SELECT id FROM reachable)
      AND ${parentTopicId === null
        ? sql`t.parent_id IS NULL`
        : sql`t.parent_id = ${parentTopicId}`}
    ORDER BY t.name
  `);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    parentId: r.parent_id,
    description: r.description,
    problemCount: r.problem_count,
    scopedProblemCount: r.scoped_problem_count,
  }));
}

/**
 * Check if a topic has any children that are reachable within an age category
 * (i.e. transitively contains at least one tagged problem in that category).
 * Used by the leaf detection on the topic detail page when filtered by age.
 */
export async function topicHasScopedChildren(
  topicId: string,
  ageCategoryId: string
): Promise<boolean> {
  const result = await db.execute<{ exists: boolean }>(sql`
    WITH RECURSIVE descendants AS (
      SELECT id FROM ${topics} WHERE parent_id = ${topicId}
      UNION
      SELECT t.id FROM ${topics} t
      JOIN descendants d ON t.parent_id = d.id
    )
    SELECT EXISTS (
      SELECT 1 FROM ${problemTopics} pt
      JOIN ${problemAgeCategories} pac ON pac.problem_id = pt.problem_id
      WHERE pt.topic_id IN (SELECT id FROM descendants)
        AND pac.age_category_id = ${ageCategoryId}
    ) AS exists
  `);
  return result[0]?.exists ?? false;
}

// --- Sources ----------------------------------------------------------------

export async function listSourcesWithCounts(): Promise<SourceWithCount[]> {
  const rows = await db
    .select({
      id: sources.id,
      name: sources.name,
      slug: sources.slug,
      kind: sources.kind,
      country: sources.country,
      parentId: sources.parentId,
      problemCount: sql<number>`(
        SELECT count(*)::int
        FROM ${problems}
        WHERE ${problems.sourceId} = ${sources.id}
      )`,
    })
    .from(sources)
    .orderBy(sources.name);
  return rows;
}

export async function getSourceById(id: string): Promise<Source | null> {
  const rows = await db
    .select()
    .from(sources)
    .where(eq(sources.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** Direct children of a source (one level), each with its problem count. */
export async function getSourceChildren(
  parentId: string
): Promise<SourceWithCount[]> {
  const rows = await db
    .select({
      id: sources.id,
      name: sources.name,
      slug: sources.slug,
      kind: sources.kind,
      country: sources.country,
      parentId: sources.parentId,
      problemCount: sql<number>`(
        SELECT count(*)::int
        FROM ${problems}
        WHERE ${problems.sourceId} = ${sources.id}
      )`,
    })
    .from(sources)
    .where(eq(sources.parentId, parentId))
    .orderBy(sources.name);
  return rows;
}

/** Ancestor chain of a source (root → … → parent of the given id). */
export async function getSourceAncestors(id: string): Promise<Source[]> {
  const chain: Source[] = [];
  let cursor: string | null = id;
  const seen = new Set<string>();
  for (let i = 0; i < 16 && cursor; i++) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const current: Source | null = await getSourceById(cursor);
    if (!current) break;
    if (i > 0) chain.unshift(current);
    cursor = current.parentId;
  }
  return chain;
}

/**
 * Topics that have at least one problem tagged with the given source. Same
 * structure as `getTopicsInAgeCategory`: a recursive CTE expands "reachable"
 * topics upward via parent_id, then we filter to direct children of
 * `parentTopicId` (root-level when null). `scopedProblemCount` is the count
 * of problems sharing BOTH the topic AND the source.
 *
 * Why a single source filters problems via `problems.source_id` (not a
 * junction): a problem has exactly one source by schema, so the join is on
 * the problems table directly.
 */
export async function getTopicsInSource(
  sourceId: string,
  parentTopicId: string | null
): Promise<TopicInAgeCategory[]> {
  const rows = await db.execute<{
    id: string;
    name: string;
    slug: string;
    parent_id: string | null;
    description: string | null;
    scoped_problem_count: number;
    problem_count: number;
  }>(sql`
    WITH RECURSIVE direct_topics AS (
      SELECT DISTINCT pt.topic_id AS id
      FROM ${problemTopics} pt
      JOIN ${problems} p ON p.id = pt.problem_id
      WHERE p.source_id = ${sourceId}
    ),
    reachable AS (
      SELECT t.id, t.parent_id
      FROM ${topics} t
      JOIN direct_topics dt ON dt.id = t.id
      UNION
      SELECT t.id, t.parent_id
      FROM ${topics} t
      JOIN reachable r ON r.parent_id = t.id
    )
    SELECT
      t.id,
      t.name,
      t.slug,
      t.parent_id,
      t.description,
      (
        SELECT count(*)::int
        FROM ${problemTopics} pt
        JOIN ${problems} p ON p.id = pt.problem_id
        WHERE pt.topic_id = t.id AND p.source_id = ${sourceId}
      ) AS scoped_problem_count,
      (
        SELECT count(*)::int
        FROM ${problemTopics} pt
        WHERE pt.topic_id = t.id
      ) AS problem_count
    FROM ${topics} t
    WHERE t.id IN (SELECT id FROM reachable)
      AND ${parentTopicId === null
        ? sql`t.parent_id IS NULL`
        : sql`t.parent_id = ${parentTopicId}`}
    ORDER BY t.name
  `);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    parentId: r.parent_id,
    description: r.description,
    problemCount: r.problem_count,
    scopedProblemCount: r.scoped_problem_count,
  }));
}
