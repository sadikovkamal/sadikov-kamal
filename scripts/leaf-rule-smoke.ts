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
  });
  const leafSourceId = await createSource({
    name: `Leaf src ${SUFFIX}`,
    parentId: parentSourceId,
    logoStorageKey: null,
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
  const okId = await createProblemTx(
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

  const probAId = await createProblemTx(
    {
      bodyMd: `body-A ${SUFFIX}`,
      sourceId: leafSourceId,
      topicIds: [leafATopicId],
      ageCategoryIds: [age.id],
      image: null,
    },
    admin!.id
  );
  const probBId = await createProblemTx(
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
  // Belt-and-braces report: scan every (problem, topic) and
  // (problem, source) pair against the parent set so admins can see
  // any pre-existing leaf-rule violations. Surfaced as a warning, not
  // an assertion — these rows pre-date the rule (the live DB had 4
  // such problems on parent sources at deploy time) and need a manual
  // re-bind, but they don't block the smoke. Flip the warnings to
  // assert() once the counts reach zero so the audit becomes a true
  // regression alarm.
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

  if (badTopicRows.length > 0) {
    console.warn(
      `[!] audit: ${badTopicRows.length} (problem, topic) pair(s) point at parent topics — first: ${JSON.stringify(badTopicRows[0])}`
    );
  }
  if (badSourceRows.length > 0) {
    console.warn(
      `[!] audit: ${badSourceRows.length} problem(s) point at parent sources — first: ${JSON.stringify(badSourceRows[0])}`
    );
  }

  console.log(
    `[4] audit: ${badTopicRows.length} parent-topic + ${badSourceRows.length} parent-source legacy rows (see warnings above if non-zero)`
  );
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
