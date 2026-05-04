// Phase 8 failure-path smoke. Builds a broken bundle in memory and
// confirms the validator surfaces each kind of error correctly without
// inserting any rows.

import "../src/db/load-env";

import JSZip from "jszip";
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { users, problems, importBatches } from "../src/db/schema";
import { parseBundle } from "../src/lib/import/parse";
import { validateBundle } from "../src/lib/import/validate";
import { executeImport } from "../src/lib/import/execute";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

async function buildBrokenZip(): Promise<Uint8Array> {
  const zip = new JSZip();

  zip.file(
    "problems.md",
    `---
source: imo
year: 2024
problem_number: "BAD-1"
classes: [10, 11]
topics: [algebra]
difficulty: 7
---

# Shart

Difficulty out of range.

---
source: imo
year: 2024
problem_number: "BAD-2"
classes: [10, 11]
topics: [algebra]
difficulty: 3
---

# Shart

This problem references a missing image.

![diagram](images/missing.png)

---
source: imo
year: 2024
problem_number: "BAD-3"
classes: [10, 11]
topics: [algebra]
difficulty: 3
---

(no Shart heading on purpose; whole body is empty)

---
source: imo
year: 2024
problem_number: "GOOD-1"
classes: [10, 11]
topics: [algebra]
difficulty: 3
---

# Shart

Valid problem with real content. Tests that ok and error problems
coexist in one bundle.
`
  );

  return new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
}

async function main() {
  const admin = (await db.query.users.findMany()).find(
    (u) => u.email === "admin@example.com"
  );
  assert(admin, "admin missing");

  const zipBytes = await buildBrokenZip();
  const bundle = await parseBundle(zipBytes);
  assert(bundle.bundleErrors.length === 0, `bundle errors: ${bundle.bundleErrors.join("; ")}`);
  assert(bundle.problems.length === 4, `parsed ${bundle.problems.length}, want 4`);
  console.log(`[1] parsed broken bundle: 4 blocks`);

  const report = await validateBundle(bundle);
  assert(report.errorCount === 3, `errorCount=${report.errorCount}, want 3`);
  assert(report.okCount + report.warningCount === 1, `non-error=${report.okCount + report.warningCount}, want 1`);

  // BAD-1: difficulty out of range
  const bad1 = report.problems.find((p) => p.errors.some((e) => e.includes("difficulty")));
  assert(bad1, "missing difficulty error");
  console.log(`[2] difficulty>5 surfaced: ${bad1!.errors.join(", ").slice(0, 80)}`);

  // BAD-2: missing image
  const bad2 = report.problems.find((p) => p.errors.some((e) => e.includes("Image not in bundle")));
  assert(bad2, "missing image error");
  console.log(`[3] missing image surfaced: ${bad2!.errors[0]}`);

  // BAD-3: empty body
  const bad3 = report.problems.find((p) => p.errors.some((e) => e.includes("body is empty")));
  assert(bad3, "empty body not detected");
  console.log(`[4] empty body surfaced: ${bad3!.errors[0]}`);

  // GOOD-1: should be ok or warning (duplicate not relevant — different number)
  const good = report.problems.find((p) => p.frontmatter?.problem_number === "GOOD-1");
  assert(good, "GOOD-1 not found in report");
  assert(good!.status !== "error", `GOOD-1 status was ${good!.status}, want ok/warning`);
  console.log(`[5] GOOD-1 status=${good!.status}`);

  // Now run executeImport with this broken validation. Errors should be
  // recorded in the batch row, only GOOD-1 should land in DB.
  const [batch] = await db
    .insert(importBatches)
    .values({
      uploadedBy: admin.id,
      filename: "broken-batch.zip",
      status: "pending",
      totalCount: bundle.problems.length,
    })
    .returning({ id: importBatches.id });

  let createdProblemIds: string[] = [];
  try {
    const result = await executeImport({
      batchId: batch.id,
      bundle,
      validation: report,
      uploadedBy: admin.id,
    });
    assert(result.status === "partial", `exec status=${result.status}, want partial`);
    assert(result.successCount === 1, `success=${result.successCount}, want 1`);
    assert(result.errorLog.length === 3, `errorLog len=${result.errorLog.length}, want 3`);
    console.log(`[6] executeImport partial: 1 success, 3 errors recorded`);

    // Verify only GOOD-1 was inserted
    const inserted = await db
      .select({ id: problems.id, problemNumber: problems.problemNumber })
      .from(problems)
      .where(eq(problems.importBatchId, batch.id));
    createdProblemIds = inserted.map((p) => p.id);
    assert(inserted.length === 1, `inserted=${inserted.length}, want 1`);
    assert(inserted[0].problemNumber === "GOOD-1", `inserted=${inserted[0].problemNumber}`);
    console.log(`[7] only GOOD-1 landed in DB (id=${inserted[0].id.slice(0, 8)}…)`);

    // Verify finalized batch row reflects the error log
    const finalBatch = await db.query.importBatches.findFirst({
      where: eq(importBatches.id, batch.id),
    });
    assert(finalBatch?.status === "partial", `final status=${finalBatch?.status}`);
    const errorLog = (finalBatch?.errorLog as Array<{ error: string }>) ?? [];
    assert(errorLog.length === 3, `final errorLog len=${errorLog.length}, want 3`);
    console.log(`[8] batch row partial with 3 entries in error_log`);
  } finally {
    if (createdProblemIds.length) {
      await db.delete(problems).where(inArray(problems.id, createdProblemIds));
    }
    await db.delete(importBatches).where(eq(importBatches.id, batch.id));
    console.log(`[cleanup] removed ${createdProblemIds.length} problems + batch row`);
  }

  console.log(`\nFailure-path smoke: PASSED`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Failure-path smoke FAILED:", e);
  process.exit(1);
});
