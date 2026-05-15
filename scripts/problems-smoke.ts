// E2E smoke for Phase 5 problem data layer.
// Exercises createProblemTx, getProblemById,
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
  ageCategories,
  problems,
  problemTopics,
  problemAgeCategories,
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
    where: eq(sources.name, "IMO"),
  });
  assert(algebraTopic && inequalitiesTopic && imoSource, "seed data missing");

  // Age categories — we pick 9-sinf, 10-sinf, 11-sinf so the test
  // mirrors the old shape that exercised three categories.
  const seededCategories = await db
    .select()
    .from(ageCategories)
    .where(inArray(ageCategories.name, ["9-sinf", "10-sinf", "11-sinf"]));
  assert(
    seededCategories.length === 3,
    `seed age categories missing (got ${seededCategories.length})`
  );
  const byName = new Map(seededCategories.map((c) => [c.name, c.id]));
  const cat9 = byName.get("9-sinf")!;
  const cat10 = byName.get("10-sinf")!;
  const cat11 = byName.get("11-sinf")!;

  // --- Create -----------------------------------------------------------
  const input: ProblemInput = {
    bodyMd: "Test problem: prove $a + b \\geq 2\\sqrt{ab}$.",
    sourceId: imoSource.id,
    topicIds: [algebraTopic.id, inequalitiesTopic.id],
    ageCategoryIds: [cat9, cat10, cat11],
  };

  const newId = await createProblemTx(input, admin.id);
  console.log(`[1] createProblemTx ok: ${newId}`);

  // --- Read --------------------------------------------------------------
  const fetched = await getProblemById(newId);
  assert(fetched, "getProblemById returned null");
  assert(fetched.bodyMd === input.bodyMd, "bodyMd mismatch");
  assert(
    /^P\d{7,}$/.test(fetched.code),
    `code should match P####### shape, got ${fetched.code}`
  );
  assert(fetched.topics.length === 2, `topics count: ${fetched.topics.length}`);
  assert(
    fetched.ageCategories.length === 3,
    `ageCategories count: ${fetched.ageCategories.length}`
  );
  assert(
    fetched.ageCategories
      .map((c) => c.name)
      .sort()
      .join(",") === "10-sinf,11-sinf,9-sinf",
    "ageCategories names mismatch"
  );
  assert(fetched.source?.id === imoSource.id, "source mismatch");
  console.log(
    `[2] getProblemById ok: ${fetched.topics.length} topics, ${fetched.ageCategories.length} age categories`
  );

  // --- Update -----------------------------------------------------------
  await updateProblemTx(newId, {
    ...input,
    bodyMd: "Updated body: prove $a^2 + b^2 \\geq 2ab$.",
    ageCategoryIds: [cat10, cat11], // remove 9-sinf
  });

  const afterUpdate = await getProblemById(newId);
  assert(afterUpdate, "post-update fetch failed");
  assert(afterUpdate.bodyMd.startsWith("Updated body"), "bodyMd not updated");
  assert(
    afterUpdate.ageCategories.length === 2,
    `ageCategories after update: ${afterUpdate.ageCategories.length}`
  );
  console.log(
    `[3] updateProblemTx ok: ${afterUpdate.ageCategories.length} age categories`
  );

  // --- Verify junctions are clean ---------------------------------------
  // updateProblemTx should have wiped + reinserted junctions cleanly.
  const lingeringTopicLinks = await db
    .select()
    .from(problemTopics)
    .where(eq(problemTopics.problemId, newId));
  const lingeringCategoryLinks = await db
    .select()
    .from(problemAgeCategories)
    .where(eq(problemAgeCategories.problemId, newId));
  assert(
    lingeringTopicLinks.length === 2,
    `lingering topic links: ${lingeringTopicLinks.length}`
  );
  assert(
    lingeringCategoryLinks.length === 2,
    `lingering age-category links: ${lingeringCategoryLinks.length}`
  );
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
  const orphanCategories = await db
    .select()
    .from(problemAgeCategories)
    .where(eq(problemAgeCategories.problemId, newId));
  assert(
    orphanTopics.length === 0,
    `orphan problem_topics: ${orphanTopics.length}`
  );
  assert(
    orphanCategories.length === 0,
    `orphan problem_age_categories: ${orphanCategories.length}`
  );
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
