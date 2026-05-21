import "server-only";

import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  problems,
  problemTopics,
  problemAgeCategories,
  images,
  topics,
  sources,
} from "@/db/schema";
import { formatProblemCode, parseProblemCodeSeq } from "./codes";
import { parentIdSet } from "@/lib/taxonomy/hierarchy";

/**
 * Throw if any of the given ids is a parent in its taxonomy. Run
 * inside every problem-write mutation so a tampered or stale client
 * can't sneak a problem onto a parent node.
 *
 * Reads only the columns we need from both taxonomies; one query each.
 */
async function assertLeavesOnly(
  tx: Pick<typeof db, "select">,
  sourceIds: string[],
  topicIds: string[]
): Promise<void> {
  if (sourceIds.length > 0) {
    const allSources = await tx
      .select({ id: sources.id, parentId: sources.parentId })
      .from(sources);
    const sourceParents = parentIdSet(allSources);
    const badSource = sourceIds.find((id) => sourceParents.has(id));
    if (badSource) {
      throw new Error(
        `Parent guruh manbaga masala biriktirib bo'lmaydi (${badSource})`
      );
    }
  }
  if (topicIds.length > 0) {
    const allTopics = await tx
      .select({ id: topics.id, parentId: topics.parentId })
      .from(topics);
    const topicParents = parentIdSet(allTopics);
    const badTopic = topicIds.find((id) => topicParents.has(id));
    if (badTopic) {
      throw new Error(
        `Parent guruh mavzuga masala biriktirib bo'lmaydi (${badTopic})`
      );
    }
  }
}

export interface ProblemImageInput {
  storageKey: string;
  originalFilename: string;
  sizeBytes: number;
  mimeType: string;
}

export interface ProblemInput {
  bodyMd: string;
  sourceId: string;
  topicIds: string[];
  ageCategoryIds: string[];
  image?: ProblemImageInput | null;
  metadata?: Record<string, unknown>;
}

/**
 * Insert a problem and all its junction rows in a single transaction.
 * If any insert fails, the whole thing rolls back — no orphaned junctions.
 *
 * The `code` is auto-assigned: we read max(code) inside the transaction
 * and format the next P####### value. The UNIQUE on the column makes
 * a parallel-creator race surface as a clean constraint error, which
 * the action layer can retry. For a low-volume admin app the race is
 * extremely rare in practice.
 */
export async function createProblemTx(input: ProblemInput, createdBy: string) {
  return db.transaction(async (tx) => {
    await assertLeavesOnly(tx, [input.sourceId], input.topicIds);
    // Compute next code from the current max. Pulling just max() keeps
    // this O(1) instead of fetching every code.
    const [{ maxCode }] = await tx
      .select({ maxCode: sql<string | null>`max(${problems.code})` })
      .from(problems);
    const seq = maxCode ? parseProblemCodeSeq(maxCode) : 0;
    const code = formatProblemCode(Number.isFinite(seq) ? seq + 1 : 1);

    const [created] = await tx
      .insert(problems)
      .values({
        code,
        bodyMd: input.bodyMd,
        sourceId: input.sourceId,
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
    if (input.ageCategoryIds.length) {
      await tx.insert(problemAgeCategories).values(
        input.ageCategoryIds.map((ageCategoryId) => ({
          problemId: created.id,
          ageCategoryId,
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

    // Return both id (for any internal follow-up) and code (for the
    // action layer to redirect into /admin/problems/<code>).
    return { id: created.id, code };
  });
}

/**
 * Update a problem and replace its junction rows wholesale.
 * Diffing for MVP isn't worth the complexity — deletes + inserts inside a
 * transaction is cheap enough.
 *
 * Returns the storage keys of any images that were replaced so the
 * caller can delete them from R2 after the commit. The R2 delete is
 * deliberately kept out of the transaction: if R2 is unavailable we
 * still want the DB row to settle (it's the source of truth), and the
 * worst case is one orphan key — much better than a half-finished
 * update where the DB and R2 disagree.
 */
export async function updateProblemTx(
  id: string,
  input: ProblemInput
): Promise<{ orphanStorageKeys: string[] }> {
  return db.transaction(async (tx) => {
    await assertLeavesOnly(tx, [input.sourceId], input.topicIds);
    const oldImages = await tx
      .select({ storageKey: images.storageKey })
      .from(images)
      .where(eq(images.problemId, id));

    await tx
      .update(problems)
      .set({
        bodyMd: input.bodyMd,
        sourceId: input.sourceId,
        metadata: input.metadata ?? {},
        updatedAt: new Date(),
      })
      .where(eq(problems.id, id));

    await tx.delete(problemTopics).where(eq(problemTopics.problemId, id));
    await tx
      .delete(problemAgeCategories)
      .where(eq(problemAgeCategories.problemId, id));
    // Image is single-slot in the UI; replace wholesale.
    await tx.delete(images).where(eq(images.problemId, id));

    if (input.topicIds.length) {
      await tx.insert(problemTopics).values(
        input.topicIds.map((topicId) => ({ problemId: id, topicId }))
      );
    }
    if (input.ageCategoryIds.length) {
      await tx.insert(problemAgeCategories).values(
        input.ageCategoryIds.map((ageCategoryId) => ({
          problemId: id,
          ageCategoryId,
        }))
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

    // The new image (if any) keeps its storage key; everything else is orphan.
    const keptKey = input.image?.storageKey ?? null;
    return {
      orphanStorageKeys: oldImages
        .map((r) => r.storageKey)
        .filter((k) => k !== keptKey),
    };
  });
}

/**
 * Delete a problem. Junction rows + image DB rows cascade via FK
 * constraints, but the R2 objects themselves don't — return their
 * storage keys so the caller can clean them up post-commit.
 */
export async function deleteProblemTx(
  id: string
): Promise<{ orphanStorageKeys: string[] }> {
  return db.transaction(async (tx) => {
    const oldImages = await tx
      .select({ storageKey: images.storageKey })
      .from(images)
      .where(eq(images.problemId, id));
    await tx.delete(problems).where(eq(problems.id, id));
    return { orphanStorageKeys: oldImages.map((r) => r.storageKey) };
  });
}

/**
 * Bulk-delete N problems. Same orphan-key contract as deleteProblemTx.
 */
export async function bulkDeleteProblemsTx(
  ids: string[]
): Promise<{ orphanStorageKeys: string[] }> {
  if (ids.length === 0) return { orphanStorageKeys: [] };
  return db.transaction(async (tx) => {
    const oldImages = await tx
      .select({ storageKey: images.storageKey })
      .from(images)
      .where(inArray(images.problemId, ids));
    await tx.delete(problems).where(inArray(problems.id, ids));
    return { orphanStorageKeys: oldImages.map((r) => r.storageKey) };
  });
}

/**
 * Bulk-update fields shared by many problems.
 *
 * Each field is optional: `undefined` means "don't touch". Defined fields
 * are applied across every problem in `ids`:
 *
 *   - sourceId       → straight UPDATE on problems.source_id.
 *   - ageCategoryIds → REPLACE semantics: delete the existing junction
 *                      rows for these problems, then insert the new set.
 *   - topicIds       → REPLACE semantics (same as age categories).
 *
 * All in one transaction so a partial failure (e.g. broken FK) leaves
 * nothing half-updated. updatedAt is bumped whenever any field changes,
 * so a "what changed recently?" view picks these up.
 */
export interface BulkUpdateProblemsInput {
  ids: string[];
  sourceId?: string;
  ageCategoryIds?: string[];
  topicIds?: string[];
}

export async function bulkUpdateProblemsTx(
  input: BulkUpdateProblemsInput
): Promise<void> {
  if (input.ids.length === 0) return;
  const touchSource = input.sourceId !== undefined;
  const touchAges = input.ageCategoryIds !== undefined;
  const touchTopics = input.topicIds !== undefined;
  if (!touchSource && !touchAges && !touchTopics) return;

  await db.transaction(async (tx) => {
    await assertLeavesOnly(
      tx,
      touchSource ? [input.sourceId!] : [],
      touchTopics ? input.topicIds! : []
    );
    if (touchSource) {
      await tx
        .update(problems)
        .set({ sourceId: input.sourceId!, updatedAt: new Date() })
        .where(inArray(problems.id, input.ids));
    } else if (touchAges || touchTopics) {
      // Only m2m changed — bump updatedAt explicitly so the change is
      // visible in "recently updated" views without us writing a no-op
      // column change.
      await tx
        .update(problems)
        .set({ updatedAt: new Date() })
        .where(inArray(problems.id, input.ids));
    }

    if (touchAges) {
      await tx
        .delete(problemAgeCategories)
        .where(inArray(problemAgeCategories.problemId, input.ids));
      const rows = input.ids.flatMap((problemId) =>
        input.ageCategoryIds!.map((ageCategoryId) => ({
          problemId,
          ageCategoryId,
        }))
      );
      if (rows.length > 0) {
        await tx.insert(problemAgeCategories).values(rows);
      }
    }

    if (touchTopics) {
      await tx
        .delete(problemTopics)
        .where(inArray(problemTopics.problemId, input.ids));
      const rows = input.ids.flatMap((problemId) =>
        input.topicIds!.map((topicId) => ({ problemId, topicId }))
      );
      if (rows.length > 0) {
        await tx.insert(problemTopics).values(rows);
      }
    }
  });
}
