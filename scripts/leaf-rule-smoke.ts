// Smoke for the leaf-only rule, the filter descendants expansion, and
// the helper module. Runs against the local DB but isolates fixtures
// under a per-run code suffix so cleanup is safe.
//
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/leaf-rule-smoke.ts

import "../src/db/load-env";

import {
  parentIdSet,
  isLeaf,
  withDescendants,
  rollupCounts,
} from "../src/lib/taxonomy/hierarchy";
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { ageCategories, problems, problemTopics, topics, sources } from "../src/db/schema";
import {
  createProblemTx,
  updateProblemTx,
  bulkUpdateProblemsTx,
} from "../src/lib/problems/mutations";
import {
  createTopic,
  deleteTopic,
  createSource,
  deleteSource,
} from "../src/lib/taxonomy/mutations";
import { listProblems } from "../src/lib/problems/queries";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

async function helperSanity() {
  //   1
  //  / \
  // 2   3
  //     |
  //     4
  const nodes = [
    { id: "1", parentId: null },
    { id: "2", parentId: "1" },
    { id: "3", parentId: "1" },
    { id: "4", parentId: "3" },
  ];

  const parents = parentIdSet(nodes);
  assert(parents.has("1"), "1 is a parent");
  assert(parents.has("3"), "3 is a parent");
  assert(!parents.has("2"), "2 is a leaf");
  assert(!parents.has("4"), "4 is a leaf");

  assert(!isLeaf("1", parents), "isLeaf(1) false");
  assert(isLeaf("2", parents), "isLeaf(2) true");
  assert(isLeaf("4", parents), "isLeaf(4) true");

  const sub = withDescendants(["1"], nodes).sort();
  assert(
    JSON.stringify(sub) === JSON.stringify(["1", "2", "3", "4"]),
    `withDescendants(1) = ${JSON.stringify(sub)}`
  );

  const sub3 = withDescendants(["3"], nodes).sort();
  assert(
    JSON.stringify(sub3) === JSON.stringify(["3", "4"]),
    `withDescendants(3) = ${JSON.stringify(sub3)}`
  );

  // Unknown id is preserved (no silent disappearance).
  const subUnknown = withDescendants(["99"], nodes);
  assert(
    JSON.stringify(subUnknown) === JSON.stringify(["99"]),
    `withDescendants(unknown) = ${JSON.stringify(subUnknown)}`
  );

  // rollupCounts: parents sum every descendant's own count + their own.
  //
  //   A (own=0)
  //   ├─ B (own=0)
  //   │   ├─ D (own=3, leaf)
  //   │   └─ E (own=5, leaf)
  //   └─ C (own=2, leaf)
  //   F (own=10, root leaf)
  //
  // Expected: D=3, E=5, B=8 (3+5), C=2, A=10 (8+2), F=10.
  const countNodes = [
    { id: "A", parentId: null, problemCount: 0 },
    { id: "B", parentId: "A", problemCount: 0 },
    { id: "D", parentId: "B", problemCount: 3 },
    { id: "E", parentId: "B", problemCount: 5 },
    { id: "C", parentId: "A", problemCount: 2 },
    { id: "F", parentId: null, problemCount: 10 },
  ];
  const roll = rollupCounts(countNodes);
  assert(roll.get("D") === 3, `rollup D=3, got ${roll.get("D")}`);
  assert(roll.get("E") === 5, `rollup E=5, got ${roll.get("E")}`);
  assert(roll.get("B") === 8, `rollup B=8, got ${roll.get("B")}`);
  assert(roll.get("C") === 2, `rollup C=2, got ${roll.get("C")}`);
  assert(roll.get("A") === 10, `rollup A=10, got ${roll.get("A")}`);
  assert(roll.get("F") === 10, `rollup F=10, got ${roll.get("F")}`);

  // Drift defense: a problem mis-attached to an ancestor still gets
  // counted under that ancestor (leaf-only guard normally prevents this,
  // but the rollup must not silently drop it).
  const drift = rollupCounts([
    { id: "P", parentId: null, problemCount: 7 },
    { id: "L", parentId: "P", problemCount: 11 },
  ]);
  assert(drift.get("P") === 18, `drift P=18, got ${drift.get("P")}`);

  console.log("[1] hierarchy helpers ok");
}

const SUFFIX = `leaf-${Date.now()}`;

async function mutationGuards() {
  // Fixtures: a parent and a leaf in both taxonomies.
  const parentTopicId = await createTopic({
    name: `Parent ${SUFFIX}`,
    parentId: null,
    description: null,
  });
  const leafTopicId = await createTopic({
    name: `Leaf ${SUFFIX}`,
    parentId: parentTopicId,
    description: null,
  });
  const parentSourceId = await createSource({
    name: `Parent src ${SUFFIX}`,
    parentId: null,
    logoStorageKey: null,
    description: null,
  });
  const leafSourceId = await createSource({
    name: `Leaf src ${SUFFIX}`,
    parentId: parentSourceId,
    logoStorageKey: null,
    description: null,
  });

  // Need an admin user for createdBy and an age category for the FK.
  const admin = (await db.query.users.findMany()).find(
    (u) => u.email === "admin@example.com"
  );
  assert(admin, "admin user missing — seed required");
  const [age] = await db
    .select({ id: ageCategories.id })
    .from(ageCategories)
    .limit(1);
  assert(age, "age category missing — seed required");

  // Helper: expect a thrown error whose message matches /Parent guruh/.
  async function expectParentRejection(
    fn: () => Promise<unknown>,
    label: string
  ) {
    let err: unknown = null;
    try {
      await fn();
    } catch (e) {
      err = e;
    }
    assert(err instanceof Error, `${label}: expected an error`);
    assert(
      /Parent guruh/.test((err as Error).message),
      `${label}: expected Parent-guruh error, got "${(err as Error).message}"`
    );
  }

  // create — parent source
  await expectParentRejection(
    () =>
      createProblemTx(
        {
          bodyMd: "Smoke",
          sourceId: parentSourceId,
          topicIds: [leafTopicId],
          ageCategoryIds: [age.id],
          image: null,
        },
        admin!.id
      ),
    "create with parent source"
  );

  // create — parent topic
  await expectParentRejection(
    () =>
      createProblemTx(
        {
          bodyMd: "Smoke",
          sourceId: leafSourceId,
          topicIds: [parentTopicId],
          ageCategoryIds: [age.id],
          image: null,
        },
        admin!.id
      ),
    "create with parent topic"
  );

  // Build a real (leaf-only) problem so update + bulkUpdate have a target.
  const { id: okId } = await createProblemTx(
    {
      bodyMd: "Smoke OK",
      sourceId: leafSourceId,
      topicIds: [leafTopicId],
      ageCategoryIds: [age.id],
      image: null,
    },
    admin!.id
  );

  // update — parent source
  await expectParentRejection(
    () =>
      updateProblemTx(okId, {
        bodyMd: "Smoke OK",
        sourceId: parentSourceId,
        topicIds: [leafTopicId],
        ageCategoryIds: [age.id],
        image: null,
      }),
    "update with parent source"
  );

  // bulkUpdate — parent topic
  await expectParentRejection(
    () =>
      bulkUpdateProblemsTx({
        ids: [okId],
        topicIds: [parentTopicId],
      }),
    "bulkUpdate with parent topic"
  );

  // Cleanup fixtures.
  await db.delete(problems).where(eq(problems.id, okId));
  await deleteTopic(leafTopicId);
  await deleteTopic(parentTopicId);
  await deleteSource(leafSourceId);
  await deleteSource(parentSourceId);

  console.log("[2] mutation guards reject parents ok");
}

async function listingExpansion() {
  // Build a tiny taxonomy: parent topic with two leaf children, one
  // leaf source, one age category. Create a problem under each leaf
  // topic. Filter by the parent topic code; expect both problems.
  const parentTopicId = await createTopic({
    name: `Parent-list ${SUFFIX}`,
    parentId: null,
    description: null,
  });
  const leafATopicId = await createTopic({
    name: `Leaf-A ${SUFFIX}`,
    parentId: parentTopicId,
    description: null,
  });
  const leafBTopicId = await createTopic({
    name: `Leaf-B ${SUFFIX}`,
    parentId: parentTopicId,
    description: null,
  });
  const leafSourceId = await createSource({
    name: `Leaf-src ${SUFFIX}`,
    parentId: null,
    logoStorageKey: null,
    description: null,
  });

  const admin = (await db.query.users.findMany()).find(
    (u) => u.email === "admin@example.com"
  );
  assert(admin, "admin user missing");
  const [age] = await db
    .select({ id: ageCategories.id })
    .from(ageCategories)
    .limit(1);
  assert(age, "age category missing");

  const { id: probAId } = await createProblemTx(
    {
      bodyMd: `body-A ${SUFFIX}`,
      sourceId: leafSourceId,
      topicIds: [leafATopicId],
      ageCategoryIds: [age.id],
      image: null,
    },
    admin!.id
  );
  const { id: probBId } = await createProblemTx(
    {
      bodyMd: `body-B ${SUFFIX}`,
      sourceId: leafSourceId,
      topicIds: [leafBTopicId],
      ageCategoryIds: [age.id],
      image: null,
    },
    admin!.id
  );

  // Look up the parent topic's code so we filter by code (codes are the
  // public surface; we minted the ids above).
  const [parentRow] = await db
    .select({ code: topics.code })
    .from(topics)
    .where(eq(topics.id, parentTopicId));
  assert(parentRow, "parent topic row missing");

  const filtered = await listProblems(
    { topicCodes: [parentRow.code] },
    { field: "createdAt", direction: "desc" },
    1,
    100
  );
  const matchedIds = new Set(filtered.rows.map((r) => r.id));
  assert(
    matchedIds.has(probAId) && matchedIds.has(probBId),
    `listProblems(parent code) should match both leaves (got ids=${Array.from(
      matchedIds
    ).join(",")})`
  );

  // Filtering by a single leaf code matches only that leaf.
  const [leafARow] = await db
    .select({ code: topics.code })
    .from(topics)
    .where(eq(topics.id, leafATopicId));
  const filteredLeaf = await listProblems(
    { topicCodes: [leafARow.code] },
    { field: "createdAt", direction: "desc" },
    1,
    100
  );
  const leafMatchedIds = new Set(filteredLeaf.rows.map((r) => r.id));
  assert(
    leafMatchedIds.has(probAId) && !leafMatchedIds.has(probBId),
    `listProblems(leafA code) should match only A (got ids=${Array.from(
      leafMatchedIds
    ).join(",")})`
  );

  // Cleanup.
  await db.delete(problems).where(inArray(problems.id, [probAId, probBId]));
  await deleteTopic(leafATopicId);
  await deleteTopic(leafBTopicId);
  await deleteTopic(parentTopicId);
  await deleteSource(leafSourceId);

  console.log("[3] listProblems expands parent → descendants ok");
}

async function auditExistingData() {
  // Regression alarm: nothing in the live DB should point a problem at
  // a parent topic or parent source. Verified clean at deploy time
  // (4 legacy smoke-fixture rows were removed); future drift trips
  // these asserts and the smoke fails loudly.
  const [allTopics, allSources, problemTopicPairs, problemSourcePairs] =
    await Promise.all([
      db
        .select({ id: topics.id, parentId: topics.parentId })
        .from(topics),
      db
        .select({ id: sources.id, parentId: sources.parentId })
        .from(sources),
      db
        .select({ problemId: problemTopics.problemId, topicId: problemTopics.topicId })
        .from(problemTopics),
      db
        .select({ id: problems.id, sourceId: problems.sourceId })
        .from(problems),
    ]);

  const topicParents = parentIdSet(allTopics);
  const sourceParents = parentIdSet(allSources);

  const badTopicRows = problemTopicPairs.filter((r) =>
    topicParents.has(r.topicId)
  );
  const badSourceRows = problemSourcePairs.filter((r) =>
    sourceParents.has(r.sourceId)
  );

  assert(
    badTopicRows.length === 0,
    `audit: ${badTopicRows.length} (problem, topic) pair(s) point at parent topics — first: ${JSON.stringify(badTopicRows[0])}`
  );
  assert(
    badSourceRows.length === 0,
    `audit: ${badSourceRows.length} problem(s) point at parent sources — first: ${JSON.stringify(badSourceRows[0])}`
  );

  console.log("[4] audit: no existing problems on parent nodes ok");
}

async function main() {
  await helperSanity();
  await mutationGuards();
  await listingExpansion();
  await auditExistingData();
  console.log("Smoke: PASSED");
}

main()
  .catch((err) => {
    console.error(err);
    console.log("Smoke: FAILED");
    process.exit(1);
  })
  .then(() => process.exit(0));
