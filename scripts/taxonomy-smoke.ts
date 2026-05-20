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
  });
  await updateSource(sourceId, {
    name: "Smoke Source Updated",
    parentId: null,
    logoStorageKey: null,
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
  const problemId = await createProblemTx(
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
