import "server-only";

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { topics, sources, tags, problemTags } from "@/db/schema";

// --- Topics -----------------------------------------------------------------

export interface TopicInput {
  name: string;
  slug: string;
  parentId: string | null;
  description: string | null;
}

export async function createTopic(input: TopicInput): Promise<string> {
  const [created] = await db
    .insert(topics)
    .values(input)
    .returning({ id: topics.id });
  return created.id;
}

export async function updateTopic(id: string, input: TopicInput): Promise<void> {
  await db.update(topics).set(input).where(eq(topics.id, id));
}

/**
 * Delete a topic.
 *
 * The schema sets `topics.parentId` ON DELETE SET NULL, so child topics
 * survive but become roots. Junction table `problem_topics` is ON DELETE
 * RESTRICT — Postgres throws if any problem still references this topic,
 * and the action layer surfaces that as a friendly error.
 */
export async function deleteTopic(id: string): Promise<void> {
  await db.delete(topics).where(eq(topics.id, id));
}

// --- Sources ----------------------------------------------------------------

export type SourceKind = "olympiad" | "book" | "course" | "other";

export interface SourceInput {
  name: string;
  slug: string;
  kind: SourceKind;
  country: string | null;
}

export async function createSource(input: SourceInput): Promise<string> {
  const [created] = await db
    .insert(sources)
    .values(input)
    .returning({ id: sources.id });
  return created.id;
}

export async function updateSource(
  id: string,
  input: SourceInput
): Promise<void> {
  await db.update(sources).set(input).where(eq(sources.id, id));
}

/** Like deleteTopic, ON DELETE RESTRICT trips on referencing problems. */
export async function deleteSource(id: string): Promise<void> {
  await db.delete(sources).where(eq(sources.id, id));
}

// --- Tags -------------------------------------------------------------------

export interface TagInput {
  name: string;
  slug: string;
}

export async function createTag(input: TagInput): Promise<string> {
  const [created] = await db
    .insert(tags)
    .values(input)
    .returning({ id: tags.id });
  return created.id;
}

export async function updateTag(id: string, input: TagInput): Promise<void> {
  await db.update(tags).set(input).where(eq(tags.id, id));
}

export async function deleteTag(id: string): Promise<void> {
  await db.delete(tags).where(eq(tags.id, id));
}

/**
 * Merge tag `fromId` into `toId`:
 * 1. Re-point every `problem_tags` row pointing at `fromId` to `toId`,
 *    skipping rows where the same `problem_id` already has `toId` (those
 *    would violate the composite primary key).
 * 2. Delete the leftover `(problem_id, fromId)` rows that we couldn't
 *    re-point because the destination already existed.
 * 3. Delete the `fromId` tag itself.
 *
 * Wrapped in a transaction so all three steps land or none do.
 */
export async function mergeTag(fromId: string, toId: string): Promise<void> {
  if (fromId === toId) return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      UPDATE problem_tags AS pt
      SET tag_id = ${toId}
      WHERE pt.tag_id = ${fromId}
        AND NOT EXISTS (
          SELECT 1 FROM problem_tags AS pt2
          WHERE pt2.problem_id = pt.problem_id
            AND pt2.tag_id = ${toId}
        )
    `);
    await tx.delete(problemTags).where(eq(problemTags.tagId, fromId));
    await tx.delete(tags).where(eq(tags.id, fromId));
  });
}
