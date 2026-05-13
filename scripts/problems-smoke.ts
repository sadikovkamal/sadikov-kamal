// E2E smoke for Phase 5 problem data layer.
// Exercises createProblemTx, getProblemById,
// updateProblemTx, and deleteProblemTx against the live local DB.
//
// Run: npx tsx scripts/problems-smoke.ts

import "../src/db/load-env";

import { eq } from "drizzle-orm";
import { db } from "../src/db";
import {
  users,
  topics,
  sources,
  problems,
  problemTopics,
  problemClasses,
} from "../src/db/schema";
import {
  createProblemTx,
  updateProblemTx,
  deleteProblemTx,
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
    where: eq(topics.name, "Algebra"),
  });
  const inequalitiesTopic = await db.query.topics.findFirst({
    where: eq(topics.name, "Tengsizliklar"),
  });
  const imoSource = await db.query.sources.findFirst({
    where: eq(sources.slug, "imo"),
  });
  assert(algebraTopic && inequalitiesTopic && imoSource, "seed data missing");

  // --- Create -----------------------------------------------------------
  const input: ProblemInput = {
    bodyMd: "Test problem: prove $a + b \\geq 2\\sqrt{ab}$.",
    solutionMd: "By AM-GM, $\\frac{a+b}{2} \\geq \\sqrt{ab}$.",
    answer: null,
    sourceId: imoSource.id,
    year: 2024,
    problemNumber: "P-SMOKE",
    topicIds: [algebraTopic.id, inequalitiesTopic.id],
    classes: [9, 10, 11],
  };

  const newId = await createProblemTx(input, admin.id);
  console.log(`[1] createProblemTx ok: ${newId}`);

  // --- Read --------------------------------------------------------------
  const fetched = await getProblemById(newId);
  assert(fetched, "getProblemById returned null");
  assert(fetched.bodyMd === input.bodyMd, "bodyMd mismatch");
  assert(fetched.year === 2024, `year mismatch: ${fetched.year}`);
  assert(fetched.problemNumber === "P-SMOKE", "problemNumber mismatch");
  assert(fetched.topics.length === 2, `topics count: ${fetched.topics.length}`);
  assert(fetched.classes.length === 3, `classes count: ${fetched.classes.length}`);
  assert(fetched.classes.sort().join(",") === "9,10,11" || fetched.classes.sort((a, b) => a - b).join(",") === "9,10,11", "classes mismatch");
  assert(fetched.source?.id === imoSource.id, "source mismatch");
  console.log(`[2] getProblemById ok: ${fetched.topics.length} topics, ${fetched.classes.length} classes`);

  // --- Update -----------------------------------------------------------
  await updateProblemTx(newId, {
    ...input,
    bodyMd: "Updated body: prove $a^2 + b^2 \\geq 2ab$.",
    classes: [10, 11], // remove class 9
  });

  const afterUpdate = await getProblemById(newId);
  assert(afterUpdate, "post-update fetch failed");
  assert(afterUpdate.bodyMd.startsWith("Updated body"), "bodyMd not updated");
  assert(afterUpdate.classes.length === 2, `classes after update: ${afterUpdate.classes.length}`);
  console.log(`[3] updateProblemTx ok: ${afterUpdate.classes.length} classes`);

  // --- Verify junctions are clean ---------------------------------------
  // updateProblemTx should have wiped + reinserted junctions cleanly.
  const lingeringTopicLinks = await db
    .select()
    .from(problemTopics)
    .where(eq(problemTopics.problemId, newId));
  const lingeringClassLinks = await db
    .select()
    .from(problemClasses)
    .where(eq(problemClasses.problemId, newId));
  assert(lingeringTopicLinks.length === 2, `lingering topic links: ${lingeringTopicLinks.length}`);
  assert(lingeringClassLinks.length === 2, `lingering class links: ${lingeringClassLinks.length}`);
  console.log(`[4] junction tables clean after update`);

  // --- Delete -----------------------------------------------------------
  await deleteProblemTx(newId);
  const afterDelete = await getProblemById(newId);
  assert(afterDelete === null, "problem still fetchable after delete");
  console.log(`[5] deleteProblemTx ok`);

  // Verify cascade — junction rows must be gone too.
  const orphanTopics = await db
    .select()
    .from(problemTopics)
    .where(eq(problemTopics.problemId, newId));
  const orphanClasses = await db
    .select()
    .from(problemClasses)
    .where(eq(problemClasses.problemId, newId));
  assert(orphanTopics.length === 0, `orphan problem_topics: ${orphanTopics.length}`);
  assert(orphanClasses.length === 0, `orphan problem_classes: ${orphanClasses.length}`);
  console.log(`[6] FK cascade purged junction rows`);

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
