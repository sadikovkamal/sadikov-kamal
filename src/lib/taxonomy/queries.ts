import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { topics, sources, problems, problemTopics } from "@/db/schema";

export interface TopicWithCount {
  id: string;
  code: string;
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
      code: topics.code,
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
    // Sort by code so the listing order is stable and predictable. The
    // page builds a tree on top of this so display order ultimately
    // follows the tree shape, but the stable input keeps it deterministic.
    .orderBy(topics.code);
  return rows;
}

export interface SourceWithCount {
  id: string;
  name: string;
  slug: string;
  kind: "olympiad" | "book" | "course" | "other";
  country: string | null;
  problemCount: number;
}

export async function listSourcesWithCounts(): Promise<SourceWithCount[]> {
  const rows = await db
    .select({
      id: sources.id,
      name: sources.name,
      slug: sources.slug,
      kind: sources.kind,
      country: sources.country,
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
