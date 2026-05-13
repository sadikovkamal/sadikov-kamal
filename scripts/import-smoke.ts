// E2E smoke for bulk import.
//
// Reads docs/examples/sample-batch.zip from disk, runs parse + validate +
// execute against the live local DB and R2, then verifies problems
// landed correctly. Cleans up everything afterwards (problems + R2
// objects). No batch history row is created — that table was dropped
// when /admin/import was removed.
//
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/import-smoke.ts

import "../src/db/load-env";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { users, problems, images } from "../src/db/schema";
import { parseBundle, splitProblemBlocks } from "../src/lib/import/parse";
import { validateBundle } from "../src/lib/import/validate";
import { executeImport } from "../src/lib/import/execute";
import { deleteFile } from "../src/lib/storage/r2";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

async function main() {
  // --- Fixtures ---------------------------------------------------------
  const admin = (await db.query.users.findMany()).find(
    (u) => u.email === "admin@example.com"
  );
  assert(admin, "admin user missing");
  void users;

  const zipPath = resolve(__dirname, "..", "docs", "examples", "sample-batch.zip");
  const zipBytes = new Uint8Array(readFileSync(zipPath));
  console.log(`[setup] sample-batch.zip = ${zipBytes.byteLength} bytes`);

  // --- Stage 1: parse ---------------------------------------------------
  const bundle = await parseBundle(zipBytes);
  assert(bundle.bundleErrors.length === 0, `bundle errors: ${bundle.bundleErrors.join("; ")}`);
  assert(bundle.problems.length === 3, `parsed ${bundle.problems.length}, want 3`);
  assert(bundle.images.size === 2, `parsed ${bundle.images.size} images, want 2`);
  assert(bundle.manifest !== null, "manifest should be present");
  assert(bundle.manifest.batch_name?.startsWith("Sample"), "manifest batch_name");
  console.log(`[1] parseBundle ok: 3 problems, 2 images, manifest present`);

  // --- Stage 2: validate ------------------------------------------------
  const report = await validateBundle(bundle);
  assert(
    report.errorCount === 0,
    `validation errors: ${JSON.stringify(report.problems.filter((p) => p.status === "error"))}`
  );
  console.log(`[2] validate ok: ${report.okCount} ok / ${report.warningCount} warn / ${report.errorCount} err`);

  // --- Stage 3: execute -------------------------------------------------
  const exec = await executeImport({
    bundle,
    validation: report,
    uploadedBy: admin.id,
  });
  assert(exec.successCount === 3, `success=${exec.successCount}, want 3 (errorLog=${JSON.stringify(exec.errorLog)})`);
  assert(exec.totalCount === 3, `total=${exec.totalCount}, want 3`);
  console.log(`[3] executeImport: ${exec.successCount}/${exec.totalCount}`);

  // --- DB verification --------------------------------------------------
  // No batch tracking — find the inserted problems by their unique
  // (source, year, problemNumber) tuples derived from the bundle.
  const inserted = await db
    .select()
    .from(problems)
    .where(
      inArray(
        problems.problemNumber,
        bundle.problems
          .map((p) => p.rawFrontmatter?.problem_number as string | undefined)
          .filter((n): n is string => typeof n === "string")
      )
    );
  assert(inserted.length === 3, `inserted ${inserted.length}, want 3`);

  // R2 URLs in body markdown should have been substituted.
  const sample = inserted.find((p) => p.problemNumber === "P2");
  assert(sample, "P2 problem missing");
  assert(
    /pub-[a-z0-9]+\.r2\.dev/.test(sample.bodyMd),
    `body did not get R2 URL rewrite, got: ${sample.bodyMd.slice(0, 200)}`
  );
  console.log(`[4] R2 URLs rewritten into body markdown`);

  // Image rows persisted
  const insertedImages = await db
    .select()
    .from(images)
    .where(inArray(images.problemId, inserted.map((p) => p.id)));
  assert(insertedImages.length === 2, `image rows=${insertedImages.length}, want 2 (one per problem that references)`);
  console.log(`[5] ${insertedImages.length} image rows persisted`);

  // --- Stage 4: re-run is duplicate-detected ----------------------------
  const report2 = await validateBundle(bundle);
  const dupCount = report2.problems.filter((p) => p.isDuplicate).length;
  assert(dupCount === 3, `dup count=${dupCount}, want 3`);
  console.log(`[6] re-validate detects 3 duplicates`);

  // --- splitProblemBlocks unit-ish check --------------------------------
  // Canonical multi-problem format: `---` between problems is BOTH the
  // separator AND the opener of the next problem's frontmatter.
  const text = "---\nfoo: 1\n---\n\nbody1\n\n---\nfoo: 2\n---\n\nbody2";
  const blocks = splitProblemBlocks(text);
  assert(blocks.length === 2, `splitProblemBlocks returned ${blocks.length}, want 2`);
  assert(blocks[0].includes("foo: 1") && blocks[0].includes("body1"), "block 1 wrong");
  assert(blocks[1].includes("foo: 2") && blocks[1].includes("body2"), "block 2 wrong");
  console.log(`[7] splitProblemBlocks correctly handles multi-problem text`);

  // --- Cleanup ----------------------------------------------------------
  for (const img of insertedImages) {
    try {
      await deleteFile(img.storageKey);
    } catch {
      // best-effort
    }
  }
  // Delete problems (cascades junctions + images rows)
  await db.delete(problems).where(inArray(problems.id, inserted.map((p) => p.id)));
  console.log(`[cleanup] removed ${inserted.length} problems, ${insertedImages.length} R2 objects`);

  console.log(`\nImport smoke: PASSED`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Import smoke FAILED:", e);
  process.exit(1);
});
