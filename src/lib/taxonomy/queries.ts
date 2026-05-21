import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  topics,
  sources,
  ageCategories,
  problems,
  problemTopics,
  problemAgeCategories,
} from "@/db/schema";
import { rollupCounts } from "./hierarchy";

export interface TopicWithCount {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  description: string | null;
  problemCount: number;
}

export async function listTopicsWithCounts(): Promise<TopicWithCount[]> {
  // Same shape as listSourcesWithCounts (two queries + JS merge) — see
  // the long comment there. Junction tables don't have an `id` column
  // so the old correlated subquery happened to resolve correctly, but
  // the safer pattern is to never depend on Drizzle's outer-scope
  // resolution at all.
  const [rows, directCounts] = await Promise.all([
    db
      .select({
        id: topics.id,
        code: topics.code,
        name: topics.name,
        parentId: topics.parentId,
        description: topics.description,
      })
      .from(topics)
      // Sort by code so the listing order is stable and predictable. The
      // page builds a tree on top of this so display order ultimately
      // follows the tree shape, but the stable input keeps it deterministic.
      .orderBy(topics.code),
    db
      .select({
        topicId: problemTopics.topicId,
        count: sql<number>`count(*)::int`,
      })
      .from(problemTopics)
      .groupBy(problemTopics.topicId),
  ]);

  const directByTopicId = new Map(directCounts.map((r) => [r.topicId, r.count]));
  const rowsWithDirect = rows.map((r) => ({
    ...r,
    problemCount: directByTopicId.get(r.id) ?? 0,
  }));

  // Roll counts up the tree so parents show the total problems sitting
  // under them. With the leaf-only rule, ancestor "own" counts are 0,
  // so the rollup is effectively "sum of all leaf-descendant counts".
  const rollup = rollupCounts(rowsWithDirect);
  return rowsWithDirect.map((r) => ({
    ...r,
    problemCount: rollup.get(r.id) ?? 0,
  }));
}

export interface SourceWithCount {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  /** Raw R2 storage key — used by the edit dialog to know what to send
   *  back on save. */
  logoStorageKey: string | null;
  /** Pre-resolved public URL for client-side <Image> previews. Null
   *  when no logo is set. Server-side resolution avoids exposing R2
   *  config to the client via NEXT_PUBLIC_*. */
  logoPublicUrl: string | null;
  /** Free-form admin notes. Shown only in the info modal on the
   *  explorer; null/empty leaves the modal section blank. */
  description: string | null;
  problemCount: number;
}

export async function listSourcesWithCounts(): Promise<SourceWithCount[]> {
  // Two parallel queries instead of a correlated subquery: the previous
  // approach used `WHERE problems.source_id = sources.id` inline, which
  // Drizzle rendered with an unqualified `"id"` — and since `problems`
  // has its own `id` column, the inner scope shadowed `sources.id` and
  // the count was *always* 0. Splitting into a GROUP BY + JS merge
  // sidesteps the shadowing entirely.
  const [rows, directCounts] = await Promise.all([
    db
      .select({
        id: sources.id,
        code: sources.code,
        name: sources.name,
        parentId: sources.parentId,
        logoStorageKey: sources.logoStorageKey,
        description: sources.description,
      })
      .from(sources)
      // Sort by code so listing order is stable and predictable. The page
      // builds a tree on top, so final display follows the tree shape;
      // the stable code-based input keeps sibling order deterministic.
      .orderBy(sources.code),
    db
      .select({
        sourceId: problems.sourceId,
        count: sql<number>`count(*)::int`,
      })
      .from(problems)
      .groupBy(problems.sourceId),
  ]);

  const directBySourceId = new Map(
    directCounts.map((r) => [r.sourceId, r.count])
  );

  // Stitch the direct count onto each source row, then roll counts up
  // the tree so a parent source's "ta masala" label reflects every
  // problem under its subtree (own + descendants). Under the leaf-only
  // rule, ancestor direct counts are 0; the rollup is effectively the
  // sum of leaf-descendant counts.
  const rowsWithDirect = rows.map((r) => ({
    ...r,
    problemCount: directBySourceId.get(r.id) ?? 0,
  }));
  const rollup = rollupCounts(rowsWithDirect);

  // Lazy R2 URL resolution: if R2 isn't configured (e.g. local dev with
  // no .env), every logo URL falls back to null — the card simply renders
  // the abbreviation badge.
  const publicBase = resolveR2PublicBase();
  return rowsWithDirect.map((r) => ({
    ...r,
    problemCount: rollup.get(r.id) ?? 0,
    logoPublicUrl: r.logoStorageKey && publicBase
      ? `${publicBase}/${r.logoStorageKey}`
      : null,
  }));
}

function resolveR2PublicBase(): string | null {
  const base = process.env.R2_PUBLIC_URL;
  if (!base) return null;
  return base.replace(/\/+$/, "");
}

export interface AgeCategoryWithCount {
  id: string;
  code: string;
  name: string;
  description: string | null;
  problemCount: number;
}

export async function listAgeCategoriesWithCounts(): Promise<
  AgeCategoryWithCount[]
> {
  // Same defensive pattern as the source/topic listings — two queries
  // and a JS merge, so we never rely on Drizzle's outer-scope column
  // resolution inside a correlated subquery.
  const [rows, directCounts] = await Promise.all([
    db
      .select({
        id: ageCategories.id,
        code: ageCategories.code,
        name: ageCategories.name,
        description: ageCategories.description,
      })
      .from(ageCategories)
      // Ordered by code so the seeded ladder (A000001 → A000012) reads
      // top-to-bottom as 1-sinf → Talaba, and any admin-added rows land
      // at the end in insertion order.
      .orderBy(ageCategories.code),
    db
      .select({
        ageCategoryId: problemAgeCategories.ageCategoryId,
        count: sql<number>`count(*)::int`,
      })
      .from(problemAgeCategories)
      .groupBy(problemAgeCategories.ageCategoryId),
  ]);

  const byId = new Map(directCounts.map((r) => [r.ageCategoryId, r.count]));
  return rows.map((r) => ({ ...r, problemCount: byId.get(r.id) ?? 0 }));
}
