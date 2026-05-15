import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { topics, sources, ageCategories } from "@/db/schema";

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
  parentId: string | null;
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

// --- Age categories ---------------------------------------------------------

export interface AgeCategoryInput {
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
}

export async function createAgeCategory(
  input: AgeCategoryInput
): Promise<string> {
  const [created] = await db
    .insert(ageCategories)
    .values(input)
    .returning({ id: ageCategories.id });
  return created.id;
}

export async function updateAgeCategory(
  id: string,
  input: AgeCategoryInput
): Promise<void> {
  await db.update(ageCategories).set(input).where(eq(ageCategories.id, id));
}

/**
 * Delete an age category. The junction `problem_age_categories.ageCategoryId`
 * is ON DELETE RESTRICT — Postgres throws when problems still reference this
 * category. The action layer maps that into a friendly error message.
 */
export async function deleteAgeCategory(id: string): Promise<void> {
  await db.delete(ageCategories).where(eq(ageCategories.id, id));
}
