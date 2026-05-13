import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { topics, sources } from "@/db/schema";
import { nextTopicCode } from "./topic-codes";

// --- Topics -----------------------------------------------------------------

export interface TopicInput {
  name: string;
  parentId: string | null;
  description: string | null;
}

export async function createTopic(input: TopicInput): Promise<string> {
  // Compute the next code from the existing set. The DB has a UNIQUE
  // constraint on `code`, so a race between two parallel creates surfaces
  // as a clean constraint error that the caller can retry — we don't
  // pre-lock the table.
  const existing = await db.select({ code: topics.code }).from(topics);
  const code = nextTopicCode(existing.map((r) => r.code));

  const [created] = await db
    .insert(topics)
    .values({ ...input, code })
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
