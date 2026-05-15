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

export interface TopicWithCount {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  description: string | null;
  problemCount: number;
}

export async function listTopicsWithCounts(): Promise<TopicWithCount[]> {
  const rows = await db
    .select({
      id: topics.id,
      code: topics.code,
      name: topics.name,
      parentId: topics.parentId,
      description: topics.description,
      problemCount: sql<number>`(
        SELECT count(*)::int
        FROM ${problemTopics}
        WHERE ${problemTopics.topicId} = ${topics.id}
      )`,
    })
    .from(topics)
    // Sort by code so the listing order is stable and predictable. The
    // page builds a tree on top of this so display order ultimately
    // follows the tree shape, but the stable input keeps it deterministic.
    .orderBy(topics.code);
  return rows;
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
  problemCount: number;
}

export async function listSourcesWithCounts(): Promise<SourceWithCount[]> {
  const rows = await db
    .select({
      id: sources.id,
      code: sources.code,
      name: sources.name,
      parentId: sources.parentId,
      logoStorageKey: sources.logoStorageKey,
      problemCount: sql<number>`(
        SELECT count(*)::int
        FROM ${problems}
        WHERE ${problems.sourceId} = ${sources.id}
      )`,
    })
    .from(sources)
    // Sort by code so listing order is stable and predictable. The page
    // builds a tree on top, so final display follows the tree shape;
    // the stable code-based input keeps sibling order deterministic.
    .orderBy(sources.code);

  // Lazy R2 URL resolution: if R2 isn't configured (e.g. local dev with
  // no .env), every logo URL falls back to null — the card simply renders
  // the abbreviation badge.
  const publicBase = resolveR2PublicBase();
  return rows.map((r) => ({
    ...r,
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
  const rows = await db
    .select({
      id: ageCategories.id,
      code: ageCategories.code,
      name: ageCategories.name,
      description: ageCategories.description,
      problemCount: sql<number>`(
        SELECT count(*)::int
        FROM ${problemAgeCategories}
        WHERE ${problemAgeCategories.ageCategoryId} = ${ageCategories.id}
      )`,
    })
    .from(ageCategories)
    // Ordered by code so the seeded ladder (A000001 → A000012) reads
    // top-to-bottom as 1-sinf → Talaba, and any admin-added rows land
    // at the end in insertion order.
    .orderBy(ageCategories.code);
  return rows;
}
