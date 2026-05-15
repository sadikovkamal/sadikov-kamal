import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  problems,
  problemTopics,
  problemClasses,
  problemAgeCategories,
} from "@/db/schema";

export interface ProblemInput {
  bodyMd: string;
  solutionMd: string | null;
  answer: string | null;
  sourceId: string;
  year: number | null;
  problemNumber: string | null;
  topicIds: string[];
  classes: number[];
  /** Optional. Empty array == no age categories attached. */
  ageCategoryIds?: string[];
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
    if (input.ageCategoryIds?.length) {
      await tx.insert(problemAgeCategories).values(
        input.ageCategoryIds.map((ageCategoryId) => ({
          problemId: created.id,
          ageCategoryId,
        }))
      );
    }

    return created.id;
  });
}

/**
 * Update a problem and replace its junction rows wholesale.
 * Diffing for MVP isn't worth the complexity — deletes + inserts inside a
 * transaction is cheap enough.
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
        metadata: input.metadata ?? {},
        updatedAt: new Date(),
      })
      .where(eq(problems.id, id));

    await tx.delete(problemTopics).where(eq(problemTopics.problemId, id));
    await tx.delete(problemClasses).where(eq(problemClasses.problemId, id));
    await tx
      .delete(problemAgeCategories)
      .where(eq(problemAgeCategories.problemId, id));

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
    if (input.ageCategoryIds?.length) {
      await tx.insert(problemAgeCategories).values(
        input.ageCategoryIds.map((ageCategoryId) => ({
          problemId: id,
          ageCategoryId,
        }))
      );
    }
  });
}

export async function deleteProblemTx(id: string) {
  // Junction rows + images cascade via FK constraints (Phase 1 schema).
  await db.delete(problems).where(eq(problems.id, id));
}
