// E2E smoke for Phase 9 taxonomy library + merge logic.
// Exercises slugify, listTopicsWithCounts/Sources/Tags, CRUD via mutations,
// FK-restrict on delete, and tag merge with composite-PK collision handling.
//
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/taxonomy-smoke.ts

import "../src/db/load-env";

import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import {
  users,
  topics,
  sources,
  tags,
  problems,
  problemTags,
} from "../src/db/schema";
import { slugify } from "../src/lib/utils/slug";
import {
  listTopicsWithCounts,
  listSourcesWithCounts,
  listTagsWithCounts,
} from "../src/lib/taxonomy/queries";
import {
  createTopic,
  updateTopic,
  deleteTopic,
  createSource,
  updateSource,
  deleteSource,
  createTag,
  updateTag,
  deleteTag,
  mergeTag,
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
    name: "Smoke Topic",
    slug: "smoke-topic-99",
    parentId: null,
    description: null,
  });
  assert(typeof topicId === "string" && topicId.length > 0, "createTopic id");

  const childId = await createTopic({
    name: "Smoke Child",
    slug: "smoke-child-99",
    parentId: topicId,
    description: "child of smoke-topic-99",
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
    slug: "smoke-topic-99",
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
      difficulty: 3,
      topicIds: [topicId],
      classes: [9],
      tagIds: [],
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

  // --- Tags CRUD --------------------------------------------------------
  const tagAId = await createTag({ name: "smoke-a-99", slug: "smoke-a-99" });
  const tagBId = await createTag({ name: "smoke-b-99", slug: "smoke-b-99" });
  await updateTag(tagAId, { name: "smoke-a-99-renamed", slug: "smoke-a-99" });

  const tagsList = await listTagsWithCounts();
  const a = tagsList.find((t) => t.id === tagAId);
  assert(a?.name === "smoke-a-99-renamed", `tag rename failed: ${a?.name}`);
  console.log(`[8] tags CRUD ok`);

  // --- Tag merge --------------------------------------------------------
  // Build 3 problems:
  //   p1 has only tagA  -> after merge, should have only tagB
  //   p2 has both tagA + tagB -> after merge, should have only tagB (no dup)
  //   p3 has only tagB  -> unchanged
  // We need a fresh source/topic for these.
  const tmpSourceId = await createSource({
    name: "Tmp",
    slug: "tmp-merge-source",
    kind: "olympiad",
    country: null,
  });
  const tmpTopicId = await createTopic({
    name: "Tmp",
    slug: "tmp-merge-topic",
    parentId: null,
    description: null,
  });

  const p1 = await createProblemTx(
    {
      bodyMd: "p1",
      solutionMd: null,
      answer: null,
      sourceId: tmpSourceId,
      year: null,
      problemNumber: null,
      difficulty: 3,
      topicIds: [tmpTopicId],
      classes: [9],
      tagIds: [tagAId],
    },
    admin.id
  );
  const p2 = await createProblemTx(
    {
      bodyMd: "p2",
      solutionMd: null,
      answer: null,
      sourceId: tmpSourceId,
      year: null,
      problemNumber: null,
      difficulty: 3,
      topicIds: [tmpTopicId],
      classes: [9],
      tagIds: [tagAId, tagBId],
    },
    admin.id
  );
  const p3 = await createProblemTx(
    {
      bodyMd: "p3",
      solutionMd: null,
      answer: null,
      sourceId: tmpSourceId,
      year: null,
      problemNumber: null,
      difficulty: 3,
      topicIds: [tmpTopicId],
      classes: [9],
      tagIds: [tagBId],
    },
    admin.id
  );

  // Pre-merge sanity
  const preMerge = await db
    .select()
    .from(problemTags)
    .where(inArray(problemTags.problemId, [p1, p2, p3]));
  assert(preMerge.length === 4, `pre-merge problem_tags=${preMerge.length}, want 4`);

  // Merge A → B
  await mergeTag(tagAId, tagBId);

  // Verify state
  const postMerge = await db
    .select()
    .from(problemTags)
    .where(inArray(problemTags.problemId, [p1, p2, p3]));
  assert(postMerge.length === 3, `post-merge problem_tags=${postMerge.length}, want 3 (one per problem)`);
  // All three should now point at tagB
  assert(
    postMerge.every((r) => r.tagId === tagBId),
    `post-merge tags should all be tagB: got ${JSON.stringify(postMerge)}`
  );
  // tagA should be gone
  const aAfter = await db.query.tags.findFirst({ where: eq(tags.id, tagAId) });
  assert(aAfter === undefined, "tagA should have been deleted by merge");
  console.log(`[9] mergeTag ok (3 problems, no PK collision, tagA deleted)`);

  // --- Cleanup ----------------------------------------------------------
  await db.delete(problems).where(inArray(problems.id, [p1, p2, p3]));
  await deleteTopic(tmpTopicId);
  await deleteSource(tmpSourceId);
  await deleteTag(tagBId);
  console.log(`[cleanup] removed merge-test fixtures`);

  console.log(`\nTaxonomy smoke: PASSED`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Taxonomy smoke FAILED:", e);
  process.exit(1);
});
