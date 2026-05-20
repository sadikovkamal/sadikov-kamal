import "server-only";

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { topics, sources, ageCategories } from "@/db/schema";
import { nextTopicCode } from "./topic-codes";
import { nextAgeCategoryCode } from "./age-category-codes";
import { nextSourceCode } from "./source-codes";

// --- Topics -----------------------------------------------------------------

export interface TopicInput {
  name: string;
  parentId: string | null;
  description: string | null;
}

export async function createTopic(input: TopicInput): Promise<string> {
  // Read just max(code) instead of every code in the table — O(1) DB
  // round-trip vs. O(N) rows pulled across the wire. UNIQUE on `code`
  // turns a race between two parallel creates into a clean constraint
  // error the caller can retry; we don't pre-lock the table.
  const [maxRow] = await db
    .select({ maxCode: sql<string | null>`max(${topics.code})` })
    .from(topics);
  const code = nextTopicCode(maxRow.maxCode ? [maxRow.maxCode] : []);

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

export interface BulkTopicInput {
  name: string;
  parentId: string | null;
  description: string | null;
}

/**
 * Insert many topics in one transaction. All-or-nothing: any DB error
 * (including the UNIQUE collision two parallel admins could race into)
 * rolls back the batch — the action layer surfaces a friendly error
 * and the admin retries.
 *
 * Codes are minted sequentially in memory after one max(code) read,
 * then inserted in one VALUES (...), (...) statement.
 */
export async function bulkCreateTopics(
  inputs: BulkTopicInput[]
): Promise<{ createdCodes: string[] }> {
  if (inputs.length === 0) return { createdCodes: [] };

  return db.transaction(async (tx) => {
    const [maxRow] = await tx
      .select({ maxCode: sql<string | null>`max(${topics.code})` })
      .from(topics);

    let runningMax = maxRow.maxCode ?? "";
    // nextTopicCode only looks at the max of what it's passed, so we feed it
    // the running max one element at a time instead of accumulating the
    // whole list. Keeps allocations O(1) per row.
    const withCodes = inputs.map((input) => {
      const code = nextTopicCode(runningMax ? [runningMax] : []);
      runningMax = code;
      return { ...input, code };
    });

    const inserted = await tx
      .insert(topics)
      .values(withCodes)
      .returning({ code: topics.code });

    return { createdCodes: inserted.map((r) => r.code) };
  });
}

// --- Sources ----------------------------------------------------------------

export interface SourceInput {
  name: string;
  parentId: string | null;
  logoStorageKey: string | null;
}

export async function createSource(input: SourceInput): Promise<string> {
  // Same pattern as topics: SELECT max(code), assign next sequential.
  // UNIQUE turns a race into a clean error the caller can retry.
  const [maxRow] = await db
    .select({ maxCode: sql<string | null>`max(${sources.code})` })
    .from(sources);
  const code = nextSourceCode(maxRow.maxCode ? [maxRow.maxCode] : []);

  const [created] = await db
    .insert(sources)
    .values({ ...input, code })
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
  description: string | null;
}

export async function createAgeCategory(
  input: AgeCategoryInput
): Promise<string> {
  // Same pattern as topics: SELECT max(code), assign next sequential.
  // UNIQUE turns a race into a clean error the caller can retry.
  const [maxRow] = await db
    .select({ maxCode: sql<string | null>`max(${ageCategories.code})` })
    .from(ageCategories);
  const code = nextAgeCategoryCode(maxRow.maxCode ? [maxRow.maxCode] : []);

  const [created] = await db
    .insert(ageCategories)
    .values({ ...input, code })
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
 * Junction `problem_age_categories` is ON DELETE RESTRICT — Postgres
 * throws if any problem still uses this category. The action layer
 * surfaces it as a friendly "Avval masalalarni boshqa toifaga ko'chiring"
 * message.
 */
export async function deleteAgeCategory(id: string): Promise<void> {
  await db.delete(ageCategories).where(eq(ageCategories.id, id));
}
