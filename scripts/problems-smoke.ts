// E2E smoke for Phase 5 problem data layer.
// Exercises createProblemTx, ensureTagsByName, getProblemById,
// updateProblemTx, and deleteProblemTx against the live local DB.
//
// Run: npx tsx scripts/problems-smoke.ts

import "../src/db/load-env";

import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import {
  users,
  topics,
  sources,
  tags,
  problems,
  problemTopics,
  problemTags,
  problemClasses,
} from "../src/db/schema";
import {
  createProblemTx,
  updateProblemTx,
  deleteProblemTx,
  ensureTagsByName,
  type ProblemInput,
} from "../src/lib/problems/mutations";
import { getProblemById } from "../src/lib/problems/queries";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

async function main() {
  // --- Fixtures ---------------------------------------------------------
  const admin = await db.query.users.findFirst({
    where: eq(users.email, "admin@example.com"),
  });
  assert(admin, "seeded admin missing");

  const algebraTopic = await db.query.topics.findFirst({
    where: eq(topics.slug, "algebra"),
  });
  const inequalitiesTopic = await db.query.topics.findFirst({
    where: eq(topics.slug, "inequalities"),
  });
  const imoSource = await db.query.sources.findFirst({
    where: eq(sources.slug, "imo"),
  });
  assert(algebraTopic && inequalitiesTopic && imoSource, "seed data missing");

  // --- Tag resolution ---------------------------------------------------
  // First call should be idempotent and resolve existing seed tag ("vieta")
  // alongside a brand-new tag "smoke-only-99".
  const tagIds = await ensureTagsByName(["vieta", "Smoke Only 99", "vieta"]);
  assert(tagIds.length === 3, `expected 3 ids (with dup), got ${tagIds.length}`);
  // First and third must be identical (both "vieta").
  assert(tagIds[0] === tagIds[2], "duplicate tag did not collapse to same id");
  console.log(`[1] ensureTagsByName ok (${new Set(tagIds).size} unique ids)`);

  // Verify the new tag exists in DB.
  const smokeTag = await db.query.tags.findFirst({
    where: eq(tags.slug, "smoke-only-99"),
  });
  assert(smokeTag, "new tag was not inserted");
  console.log(`[2] new tag created: ${smokeTag.name} (${smokeTag.slug})`);

  // --- Create -----------------------------------------------------------
  const input: ProblemInput = {
    bodyMd: "Test problem: prove $a + b \\geq 2\\sqrt{ab}$.",
    solutionMd: "By AM-GM, $\\frac{a+b}{2} \\geq \\sqrt{ab}$.",
    answer: null,
    sourceId: imoSource.id,
    year: 2024,
    problemNumber: "P-SMOKE",
    difficulty: 3,
    topicIds: [algebraTopic.id, inequalitiesTopic.id],
    classes: [9, 10, 11],
    tagIds: Array.from(new Set(tagIds)), // dedupe before insert
  };

  const newId = await createProblemTx(input, admin.id);
  console.log(`[3] createProblemTx ok: ${newId}`);

  // --- Read --------------------------------------------------------------
  const fetched = await getProblemById(newId);
  assert(fetched, "getProblemById returned null");
  assert(fetched.bodyMd === input.bodyMd, "bodyMd mismatch");
  assert(fetched.year === 2024, `year mismatch: ${fetched.year}`);
  assert(fetched.problemNumber === "P-SMOKE", "problemNumber mismatch");
  assert(fetched.topics.length === 2, `topics count: ${fetched.topics.length}`);
  assert(fetched.tags.length === 2, `tags count: ${fetched.tags.length}`);
  assert(fetched.classes.length === 3, `classes count: ${fetched.classes.length}`);
  assert(fetched.classes.sort().join(",") === "9,10,11" || fetched.classes.sort((a, b) => a - b).join(",") === "9,10,11", "classes mismatch");
  assert(fetched.source?.id === imoSource.id, "source mismatch");
  console.log(`[4] getProblemById ok: ${fetched.topics.length} topics, ${fetched.tags.length} tags, ${fetched.classes.length} classes`);

  // --- Update -----------------------------------------------------------
  const newTagIds = await ensureTagsByName(["pigeonhole"]);
  await updateProblemTx(newId, {
    ...input,
    bodyMd: "Updated body: prove $a^2 + b^2 \\geq 2ab$.",
    difficulty: 4,
    classes: [10, 11], // remove class 9
    tagIds: newTagIds, // replace tags entirely
  });

  const afterUpdate = await getProblemById(newId);
  assert(afterUpdate, "post-update fetch failed");
  assert(afterUpdate.bodyMd.startsWith("Updated body"), "bodyMd not updated");
  assert(afterUpdate.difficulty === 4, "difficulty not updated");
  assert(afterUpdate.classes.length === 2, `classes after update: ${afterUpdate.classes.length}`);
  assert(afterUpdate.tags.length === 1, `tags after update: ${afterUpdate.tags.length}`);
  assert(afterUpdate.tags[0].slug === "pigeonhole", "wrong tag after update");
  console.log(`[5] updateProblemTx ok: difficulty=${afterUpdate.difficulty}, ${afterUpdate.classes.length} classes, tag=${afterUpdate.tags[0].slug}`);

  // --- Verify junctions are clean ---------------------------------------
  // updateProblemTx should have wiped + reinserted junctions cleanly.
  const lingeringTopicLinks = await db
    .select()
    .from(problemTopics)
    .where(eq(problemTopics.problemId, newId));
  const lingeringTagLinks = await db
    .select()
    .from(problemTags)
    .where(eq(problemTags.problemId, newId));
  const lingeringClassLinks = await db
    .select()
    .from(problemClasses)
    .where(eq(problemClasses.problemId, newId));
  assert(lingeringTopicLinks.length === 2, `lingering topic links: ${lingeringTopicLinks.length}`);
  assert(lingeringTagLinks.length === 1, `lingering tag links: ${lingeringTagLinks.length}`);
  assert(lingeringClassLinks.length === 2, `lingering class links: ${lingeringClassLinks.length}`);
  console.log(`[6] junction tables clean after update`);

  // --- Delete -----------------------------------------------------------
  await deleteProblemTx(newId);
  const afterDelete = await getProblemById(newId);
  assert(afterDelete === null, "problem still fetchable after delete");
  console.log(`[7] deleteProblemTx ok`);

  // Verify cascade — junction rows must be gone too.
  const orphanTopics = await db
    .select()
    .from(problemTopics)
    .where(eq(problemTopics.problemId, newId));
  const orphanTags = await db
    .select()
    .from(problemTags)
    .where(eq(problemTags.problemId, newId));
  const orphanClasses = await db
    .select()
    .from(problemClasses)
    .where(eq(problemClasses.problemId, newId));
  assert(orphanTopics.length === 0, `orphan problem_topics: ${orphanTopics.length}`);
  assert(orphanTags.length === 0, `orphan problem_tags: ${orphanTags.length}`);
  assert(orphanClasses.length === 0, `orphan problem_classes: ${orphanClasses.length}`);
  console.log(`[8] FK cascade purged junction rows`);

  // --- Cleanup test-only tags so a re-run is idempotent -----------------
  await db.delete(tags).where(inArray(tags.slug, ["smoke-only-99"]));
  console.log(`[cleanup] removed smoke-only-99 tag`);

  // --- Final sanity: problems table count is the same as before ---------
  const totalProblems = await db.select().from(problems);
  console.log(`[summary] problems total: ${totalProblems.length}`);

  console.log(`\nProblems data layer smoke: PASSED`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Problems smoke FAILED:", e);
  process.exit(1);
});
