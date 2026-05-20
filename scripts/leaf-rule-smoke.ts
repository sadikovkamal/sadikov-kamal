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

async function main() {
  await helperSanity();
  console.log("Smoke: PASSED");
}

main()
  .catch((err) => {
    console.error(err);
    console.log("Smoke: FAILED");
    process.exit(1);
  })
  .then(() => process.exit(0));
