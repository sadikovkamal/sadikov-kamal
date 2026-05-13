// Failure-path smoke. Builds a broken bundle in memory and confirms the
// validator surfaces each kind of error correctly and the executor only
// commits the well-formed problem.

import "../src/db/load-env";

import JSZip from "jszip";
import { inArray } from "drizzle-orm";
import { db } from "../src/db";
import { users, problems } from "../src/db/schema";
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
problem_number: "BAD-2"
classes: [10]
topics: ["Algebra"]
---

# Shart

This problem references a missing image.

![diagram](images/missing.png)

---
source: imo
year: 2024
problem_number: "BAD-3"
classes: [10]
topics: ["Algebra"]
---

(no Shart heading on purpose; whole body is empty)

---
source: imo
year: 2024
problem_number: "GOOD-1"
classes: [10]
topics: ["Algebra"]
---

# Shart

Valid problem with real content. Tests that ok and error problems
coexist in one bundle.
`
  );

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return new Uint8Array(buffer);
}

async function main() {
  const admin = (await db.query.users.findMany()).find(
    (u) => u.email === "admin@example.com"
  );
  assert(admin, "admin missing");
  void users;

  const zipBytes = await buildBrokenZip();
  const bundle = await parseBundle(zipBytes);
  assert(bundle.bundleErrors.length === 0, `bundle errors: ${bundle.bundleErrors.join("; ")}`);
  assert(bundle.problems.length === 3, `parsed ${bundle.problems.length}, want 3`);
  console.log(`[1] parsed broken bundle: 3 blocks`);

  const report = await validateBundle(bundle);
  assert(report.errorCount === 2, `errorCount=${report.errorCount}, want 2`);
  assert(report.okCount + report.warningCount === 1, `non-error=${report.okCount + report.warningCount}, want 1`);

  // BAD-2: missing image
  const bad2 = report.problems.find((p) => p.errors.some((e) => e.includes("Image not in bundle")));
  assert(bad2, "missing image error");
  console.log(`[2] missing image surfaced: ${bad2!.errors[0]}`);

  // BAD-3: empty body
  const bad3 = report.problems.find((p) => p.errors.some((e) => e.includes("body is empty")));
  assert(bad3, "empty body not detected");
  console.log(`[3] empty body surfaced: ${bad3!.errors[0]}`);

  // GOOD-1: should be ok or warning
  const good = report.problems.find((p) => p.frontmatter?.problem_number === "GOOD-1");
  assert(good, "GOOD-1 not found in report");
  assert(good!.status !== "error", `GOOD-1 status was ${good!.status}, want ok/warning`);
  console.log(`[4] GOOD-1 status=${good!.status}`);

  // Now run executeImport. Only GOOD-1 should land in DB.
  let createdProblemIds: string[] = [];
  try {
    const result = await executeImport({
      bundle,
      validation: report,
      uploadedBy: admin.id,
    });
    assert(result.successCount === 1, `success=${result.successCount}, want 1 (errorLog=${JSON.stringify(result.errorLog)})`);
    assert(result.errorLog.length === 2, `errorLog len=${result.errorLog.length}, want 2`);
    console.log(`[5] executeImport: 1 success, 2 errors recorded in returned errorLog`);

    const inserted = await db
      .select({ id: problems.id, problemNumber: problems.problemNumber })
      .from(problems)
      .where(inArray(problems.problemNumber, ["BAD-2", "BAD-3", "GOOD-1"]));
    createdProblemIds = inserted.map((p) => p.id);
    assert(inserted.length === 1, `inserted=${inserted.length}, want 1`);
    assert(inserted[0].problemNumber === "GOOD-1", `inserted=${inserted[0].problemNumber}`);
    console.log(`[6] only GOOD-1 landed in DB (id=${inserted[0].id.slice(0, 8)}…)`);
  } finally {
    if (createdProblemIds.length) {
      await db.delete(problems).where(inArray(problems.id, createdProblemIds));
    }
    console.log(`[cleanup] removed ${createdProblemIds.length} problems`);
  }

  console.log(`\nFailure-path smoke: PASSED`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Failure-path smoke FAILED:", e);
  process.exit(1);
});
