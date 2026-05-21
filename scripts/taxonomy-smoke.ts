// E2E smoke for Phase 9 taxonomy library + merge logic.
// Exercises listTopicsWithCounts/Sources, CRUD via mutations,
// FK-restrict on delete.
//
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/taxonomy-smoke.ts

import "../src/db/load-env";

import { eq } from "drizzle-orm";
import { db } from "../src/db";
import {
  users,
  problems,
  ageCategories,
} from "../src/db/schema";
import {
  listTopicsWithCounts,
  listSourcesWithCounts,
  listTopicsForSource,
  listTopicsForAgeCategory,
} from "../src/lib/taxonomy/queries";
import {
  createTopic,
  updateTopic,
  deleteTopic,
  createSource,
  updateSource,
  deleteSource,
} from "../src/lib/taxonomy/mutations";
import { createProblemTx } from "../src/lib/problems/mutations";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

async function main() {
  // (slugify has been removed — taxonomy now uses stable codes S/A/T)

  // --- Fixtures ---------------------------------------------------------
  const admin = (await db.query.users.findMany()).find(
    (u) => u.email === "admin@example.com"
  );
  assert(admin, "admin missing");

  // --- Topics CRUD ------------------------------------------------------
  const topicId = await createTopic({
    name: "Smoke Topic 99",
    parentId: null,
    description: null,
  });
  assert(typeof topicId === "string" && topicId.length > 0, "createTopic id");

  const childId = await createTopic({
    name: "Smoke Child 99",
    parentId: topicId,
    description: "child of Smoke Topic 99",
  });

  const topicsList = await listTopicsWithCounts();
  const found = topicsList.find((t) => t.id === topicId);
  assert(found, "listTopics did not include smoke-topic");
  assert(found!.problemCount === 0, "fresh topic should have 0 problems");
  const child = topicsList.find((t) => t.id === childId);
  assert(child!.parentId === topicId, "child parentId");
  console.log(`[2] topics CRUD ok (parent + child created, listed with counts)`);

  // --- Update topic -----------------------------------------------------
  await updateTopic(topicId, {
    name: "Smoke Topic Renamed",
    parentId: null,
    description: "updated",
  });
  const renamed = (await listTopicsWithCounts()).find((t) => t.id === topicId);
  assert(renamed?.name === "Smoke Topic Renamed", "topic rename failed");
  console.log(`[3] updateTopic ok`);

  // --- Sources CRUD -----------------------------------------------------
  const sourceId = await createSource({
    name: "Smoke Source",
    parentId: null,
    logoStorageKey: null,
    description: null,
  });
  await updateSource(sourceId, {
    name: "Smoke Source Updated",
    parentId: null,
    logoStorageKey: null,
    description: null,
  });
  const sourcesList = await listSourcesWithCounts();
  const sFound = sourcesList.find((s) => s.id === sourceId);
  assert(sFound?.name === "Smoke Source Updated", `source name=${sFound?.name}`);
  assert(sFound?.parentId === null, `source parentId=${sFound?.parentId}`);
  console.log(`[4] sources CRUD ok (create + update via mutations)`);

  // --- FK restrict on source delete -------------------------------------
  // Create a problem referencing the source, then try to delete it.
  // Use childId (a leaf) because the new leaf-only rule refuses to
  // attach a problem to topicId (which is the parent of childId).
  const { id: problemId } = await createProblemTx(
    {
      bodyMd: "FK restrict test",
      sourceId,
      topicIds: [childId],
      ageCategoryIds: [
        (await db.select().from(ageCategories)).find(
          (c) => c.name === "9-sinf"
        )!.id,
      ],
    },
    admin.id
  );

  // Regression: a problem attached to a leaf source must bump that
  // source's rollup count by 1, and ripple up to ancestors. This
  // catches the correlated-subquery-shadowing bug where the inner
  // `problems.id` shadowed the outer `sources.id` and the count was
  // permanently 0.
  const afterAttach = await listSourcesWithCounts();
  const leafCount = afterAttach.find((s) => s.id === sourceId)?.problemCount;
  assert(
    leafCount === 1,
    `leaf source rollup must be 1 after one attached problem, got ${leafCount}`
  );
  const childTopicCount = (await listTopicsWithCounts()).find(
    (t) => t.id === childId
  )?.problemCount;
  assert(
    childTopicCount === 1,
    `leaf topic rollup must be 1 after one attached problem, got ${childTopicCount}`
  );
  const parentTopicCount = (await listTopicsWithCounts()).find(
    (t) => t.id === topicId
  )?.problemCount;
  assert(
    parentTopicCount === 1,
    `parent topic rollup must roll up the child's 1, got ${parentTopicCount}`
  );
  console.log(`[5a] count + rollup picks up real problem inserts`);

  // listTopicsForSource: the per-source topics page reads from here.
  // It must (a) include the topic the problem hit, (b) include that
  // topic's ancestors so the tree is connected, (c) report count=1 on
  // both the leaf and the parent (via rollup), and (d) NOT include any
  // unrelated topic from the global taxonomy.
  const subtree = await listTopicsForSource(sourceId);
  const ids = new Set(subtree.map((t) => t.id));
  assert(
    ids.has(childId) && ids.has(topicId),
    "listTopicsForSource must include both the hit leaf and its parent"
  );
  const leafRow = subtree.find((t) => t.id === childId);
  const parentRow = subtree.find((t) => t.id === topicId);
  assert(
    leafRow?.problemCount === 1,
    `per-source leaf count must be 1, got ${leafRow?.problemCount}`
  );
  assert(
    parentRow?.problemCount === 1,
    `per-source parent rollup must be 1, got ${parentRow?.problemCount}`
  );
  // The full DB has many other topics; none of them should show up here.
  const allTopicCount = (await listTopicsWithCounts()).length;
  assert(
    subtree.length < allTopicCount,
    `listTopicsForSource must be a strict subset (sub=${subtree.length}, all=${allTopicCount})`
  );
  console.log(`[5b] listTopicsForSource: connected subtree + per-source counts ok`);

  // listTopicsForAgeCategory: the per-age-category page reads from
  // here. Same shape as the source variant — assert leaf + ancestor
  // both come back with count=1, and the result is a strict subset of
  // the global topic list.
  const age9 = (await db.select().from(ageCategories)).find(
    (c) => c.name === "9-sinf"
  )!;
  const acSubtree = await listTopicsForAgeCategory(age9.id);
  const acIds = new Set(acSubtree.map((t) => t.id));
  assert(
    acIds.has(childId) && acIds.has(topicId),
    "listTopicsForAgeCategory must include both the hit leaf and its parent"
  );
  const acLeaf = acSubtree.find((t) => t.id === childId);
  const acParent = acSubtree.find((t) => t.id === topicId);
  assert(
    acLeaf?.problemCount === 1,
    `per-age-category leaf count must be 1, got ${acLeaf?.problemCount}`
  );
  assert(
    acParent?.problemCount === 1,
    `per-age-category parent rollup must be 1, got ${acParent?.problemCount}`
  );
  console.log(`[5c] listTopicsForAgeCategory: connected subtree + per-age counts ok`);

  // Source filter applied to the age-category lookup: an unrelated
  // source must return an empty tree, while the actual source returns
  // the same hit as the unfiltered call.
  const acEmpty = await listTopicsForAgeCategory(age9.id, [
    "00000000-0000-0000-0000-000000000000",
  ]);
  assert(
    acEmpty.length === 0,
    `source filter with unknown id must return empty tree, got ${acEmpty.length} rows`
  );
  const acWithRealSource = await listTopicsForAgeCategory(age9.id, [sourceId]);
  assert(
    acWithRealSource.some((t) => t.id === childId),
    "source filter with the real sourceId must still surface the leaf"
  );
  console.log(`[5d] listTopicsForAgeCategory: source filter narrows the tree`);

  // Symmetric check on the source listing: passing an unrelated age
  // category id returns an empty tree; passing the real one keeps the
  // leaf in the result.
  const srcEmpty = await listTopicsForSource(sourceId, [
    "00000000-0000-0000-0000-000000000000",
  ]);
  assert(
    srcEmpty.length === 0,
    `age filter with unknown id must return empty tree, got ${srcEmpty.length} rows`
  );
  const srcWithRealAge = await listTopicsForSource(sourceId, [age9.id]);
  assert(
    srcWithRealAge.some((t) => t.id === childId),
    "age filter with the real ageCategoryId must still surface the leaf"
  );
  console.log(`[5e] listTopicsForSource: age-category filter narrows the tree`);

  let deleteFailed = false;
  try {
    await deleteSource(sourceId);
  } catch {
    deleteFailed = true;
  }
  assert(deleteFailed, "deleteSource should have failed (FK restrict)");
  console.log(`[5] FK restrict on source delete works (must reassign problems first)`);

  // Also test for topic — the problem references childId (the leaf),
  // so deleting childId should hit the FK restrict on problem_topics.
  let topicDeleteFailed = false;
  try {
    await deleteTopic(childId);
  } catch {
    topicDeleteFailed = true;
  }
  assert(topicDeleteFailed, "deleteTopic(childId) should have failed (FK restrict)");
  console.log(`[6] FK restrict on topic delete works`);

  // Clean up: delete problem first to release FK
  await db.delete(problems).where(eq(problems.id, problemId));
  // Now delete topic + source for real
  await deleteTopic(childId);
  await deleteTopic(topicId);
  await deleteSource(sourceId);
  console.log(`[7] cascade cleanup of topics + source after problem delete`);

  console.log(`\nTaxonomy smoke: PASSED`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Taxonomy smoke FAILED:", e);
  process.exit(1);
});
