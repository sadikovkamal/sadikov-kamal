import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { problems, problemTopics, problemClasses, images } from "@/db/schema";

export interface ProblemImageInput {
  storageKey: string;
  originalFilename: string;
  sizeBytes: number;
  mimeType: string;
}

export interface ProblemInput {
  bodyMd: string;
  solutionMd: string | null;
  answer: string | null;
  sourceId: string;
  year: number | null;
  problemNumber: string | null;
  topicIds: string[];
  classes: number[];
  image?: ProblemImageInput | null;
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

    if (input.image) {
      await tx.insert(images).values({
        problemId: created.id,
        storageKey: input.image.storageKey,
        originalFilename: input.image.originalFilename,
        sizeBytes: input.image.sizeBytes,
        mimeType: input.image.mimeType,
      });
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
    // Image is single-slot in the UI; replace wholesale.
    await tx.delete(images).where(eq(images.problemId, id));

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

    if (input.image) {
      await tx.insert(images).values({
        problemId: id,
        storageKey: input.image.storageKey,
        originalFilename: input.image.originalFilename,
        sizeBytes: input.image.sizeBytes,
        mimeType: input.image.mimeType,
      });
    }
  });
}

export async function deleteProblemTx(id: string) {
  // Junction rows + images cascade via FK constraints (Phase 1 schema).
  await db.delete(problems).where(eq(problems.id, id));
}
