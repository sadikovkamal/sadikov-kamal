import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  topics,
  sources,
  tags,
  problems,
  problemTopics,
  problemTags,
} from "@/db/schema";

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

export interface TagWithCount {
  id: string;
  name: string;
  slug: string;
  usageCount: number;
}

export async function listTagsWithCounts(): Promise<TagWithCount[]> {
  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
      usageCount: sql<number>`(
        SELECT count(*)::int
        FROM ${problemTags}
        WHERE ${problemTags.tagId} = ${tags.id}
      )`,
    })
    .from(tags)
    .orderBy(tags.name);
  return rows;
}
