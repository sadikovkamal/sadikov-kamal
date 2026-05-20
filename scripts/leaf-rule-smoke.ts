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
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { ageCategories, problems } from "../src/db/schema";
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

async function main() {
  await helperSanity();
  await mutationGuards();
  console.log("Smoke: PASSED");
}

main()
  .catch((err) => {
    console.error(err);
    console.log("Smoke: FAILED");
    process.exit(1);
  })
  .then(() => process.exit(0));
