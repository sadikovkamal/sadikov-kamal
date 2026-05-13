// E2E smoke for Phase 9 taxonomy library + merge logic.
// Exercises slugify, listTopicsWithCounts/Sources, CRUD via mutations,
// FK-restrict on delete.
//
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/taxonomy-smoke.ts

import "../src/db/load-env";

import { eq } from "drizzle-orm";
import { db } from "../src/db";
import {
  users,
  problems,
} from "../src/db/schema";
import { slugify } from "../src/lib/utils/slug";
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
  // --- slugify ----------------------------------------------------------
  assert(slugify("Hello World!") === "hello-world", "slugify hello-world");
  assert(slugify("  Spaces  ") === "spaces", "slugify trim");
  assert(slugify("AM-GM Inequality") === "am-gm-inequality", "slugify dashes");
  assert(slugify("user_typed_underscores") === "user-typed-underscores", "slugify underscores");
  assert(slugify("don't") === "dont", "slugify apostrophes");
  assert(slugify("hello---world") === "hello-world", "slugify collapses dashes");
  assert(slugify("Cyrillic Привет") === "cyrillic", "slugify drops non-ASCII");
  console.log(`[1] slugify ok (7 cases)`);

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
    slug: "smoke-source-99",
    kind: "olympiad",
    country: "UZ",
  });
  await updateSource(sourceId, {
    name: "Smoke Source Updated",
    slug: "smoke-source-99",
    kind: "book",
    country: null,
  });
  const sourcesList = await listSourcesWithCounts();
  const sFound = sourcesList.find((s) => s.id === sourceId);
  assert(sFound?.kind === "book", `source kind=${sFound?.kind}`);
  assert(sFound?.country === null, `source country=${sFound?.country}`);
  console.log(`[4] sources CRUD ok (created with kind=olympiad, updated to book)`);

  // --- FK restrict on source delete -------------------------------------
  // Create a problem referencing the source, then try to delete it.
  const problemId = await createProblemTx(
    {
      bodyMd: "FK restrict test",
      solutionMd: null,
      answer: null,
      sourceId,
      year: null,
      problemNumber: null,
      topicIds: [topicId],
      classes: [9],
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

  // Also test for topic
  let topicDeleteFailed = false;
  try {
    await deleteTopic(topicId);
  } catch {
    topicDeleteFailed = true;
  }
  assert(topicDeleteFailed, "deleteTopic should have failed (FK restrict)");
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
