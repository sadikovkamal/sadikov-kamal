import "server-only";

import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  problems,
  problemTopics,
  problemTags,
  problemClasses,
  tags,
} from "@/db/schema";

export interface ProblemInput {
  bodyMd: string;
  solutionMd: string | null;
  answer: string | null;
  sourceId: string;
  year: number | null;
  problemNumber: string | null;
  difficulty: number;
  topicIds: string[];
  classes: number[];
  tagIds: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Insert a problem and all its junction rows in a single transaction.
 * If any insert fails, the whole thing rolls back — no orphaned junctions.
 */
export async function createProblemTx(input: ProblemInput, createdBy: string) {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(problems)
      .values({
        bodyMd: input.bodyMd,
        solutionMd: input.solutionMd,
        answer: input.answer,
        sourceId: input.sourceId,
        year: input.year,
        problemNumber: input.problemNumber,
        difficulty: input.difficulty,
        createdBy,
        metadata: input.metadata ?? {},
      })
      .returning({ id: problems.id });

    if (input.topicIds.length) {
      await tx.insert(problemTopics).values(
        input.topicIds.map((topicId) => ({
          problemId: created.id,
          topicId,
        }))
      );
    }
    if (input.classes.length) {
      await tx.insert(problemClasses).values(
        input.classes.map((classNumber) => ({
          problemId: created.id,
          classNumber,
        }))
      );
    }
    if (input.tagIds.length) {
      await tx.insert(problemTags).values(
        input.tagIds.map((tagId) => ({ problemId: created.id, tagId }))
      );
    }

    return created.id;
  });
}

/**
 * Update a problem and replace its junction rows wholesale.
 * Diffing for MVP isn't worth the complexity — three deletes + three
 * inserts inside a transaction is cheap enough.
 */
export async function updateProblemTx(id: string, input: ProblemInput) {
  return db.transaction(async (tx) => {
    await tx
      .update(problems)
      .set({
        bodyMd: input.bodyMd,
        solutionMd: input.solutionMd,
        answer: input.answer,
        sourceId: input.sourceId,
        year: input.year,
        problemNumber: input.problemNumber,
        difficulty: input.difficulty,
        metadata: input.metadata ?? {},
        updatedAt: new Date(),
      })
      .where(eq(problems.id, id));

    await tx.delete(problemTopics).where(eq(problemTopics.problemId, id));
    await tx.delete(problemTags).where(eq(problemTags.problemId, id));
    await tx.delete(problemClasses).where(eq(problemClasses.problemId, id));

    if (input.topicIds.length) {
      await tx.insert(problemTopics).values(
        input.topicIds.map((topicId) => ({ problemId: id, topicId }))
      );
    }
    if (input.classes.length) {
      await tx.insert(problemClasses).values(
        input.classes.map((classNumber) => ({ problemId: id, classNumber }))
      );
    }
    if (input.tagIds.length) {
      await tx.insert(problemTags).values(
        input.tagIds.map((tagId) => ({ problemId: id, tagId }))
      );
    }
  });
}

export async function deleteProblemTx(id: string) {
  // Junction rows + images cascade via FK constraints (Phase 1 schema).
  await db.delete(problems).where(eq(problems.id, id));
}

/**
 * Resolve a list of free-form tag names into tag IDs in the same order.
 * Creates missing tags on the fly. Idempotent: a slug collision is a
 * no-op insert thanks to onConflictDoNothing, then the row is read back
 * for its existing ID.
 *
 * Note: onConflictDoNothing returns nothing for existing rows, which is
 * why we re-query rather than relying on RETURNING.
 */
export async function ensureTagsByName(names: string[]): Promise<string[]> {
  if (!names.length) return [];

  const trimmed = names.map((n) => n.trim()).filter((n) => n.length > 0);
  if (!trimmed.length) return [];

  const slugs = trimmed.map((n) => slugify(n));

  // Build unique (name, slug) pairs preserving the first occurrence's name.
  const uniquePairs = new Map<string, string>(); // slug -> name
  trimmed.forEach((name, i) => {
    const slug = slugs[i];
    if (!uniquePairs.has(slug)) uniquePairs.set(slug, name);
  });

  const valuesToInsert = Array.from(uniquePairs.entries()).map(
    ([slug, name]) => ({ name, slug })
  );

  await db
    .insert(tags)
    .values(valuesToInsert)
    .onConflictDoNothing({ target: tags.slug });

  const rows = await db
    .select({ id: tags.id, slug: tags.slug })
    .from(tags)
    .where(inArray(tags.slug, Array.from(uniquePairs.keys())));

  const bySlug = new Map(rows.map((r) => [r.slug, r.id]));
  return slugs
    .map((s) => bySlug.get(s))
    .filter((x): x is string => typeof x === "string");
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}
