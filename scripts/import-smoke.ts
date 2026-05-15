// E2E smoke for v2 bulk import.
//
// Builds a tiny ZIP in memory from whatever sources/age_categories/topics
// happen to exist in the local DB, runs parse + validate + execute against
// the live DB and R2, then verifies problems landed correctly. Cleans up
// afterwards.
//
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/import-smoke.ts

import "../src/db/load-env";

import JSZip from "jszip";
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import {
  users,
  problems,
  images,
  sources,
  topics,
  ageCategories,
} from "../src/db/schema";
import { parseBundle, splitProblemBlocks } from "../src/lib/import/parse";
import { validateBundle } from "../src/lib/import/validate";
import { executeImport } from "../src/lib/import/execute";
import { deleteFile } from "../src/lib/storage/r2";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

const PNG_BYTES = Uint8Array.from([
  // 1×1 transparent PNG
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

async function main() {
  const admin = (await db.query.users.findMany()).find(
    (u) => u.email === "admin@example.com"
  );
  assert(admin, "admin user missing");
  void users;

  // Pick one of each taxonomy at random from the seed.
  const [oneSource] = await db.select({ code: sources.code }).from(sources).limit(1);
  const [oneAge] = await db.select({ code: ageCategories.code }).from(ageCategories).limit(1);
  const [oneTopic] = await db.select({ code: topics.code }).from(topics).limit(1);
  assert(oneSource && oneAge && oneTopic, "seed missing — run pnpm db:seed");

  const S = oneSource.code;
  const A = oneAge.code;
  const T = oneTopic.code;

  // --- Build ZIP --------------------------------------------------------
  const zip = new JSZip();
  zip.file(
    "problems.md",
    `---
source: ${S}
age_categories: [${A}]
topics: [${T}]
---

# Shart

First problem (no image).

---

source: ${S}
age_categories: [${A}]
topics: [${T}]
---

# Shart

Second problem with an image.

![fig](images/fig1.png)
`
  );
  zip.file("images/fig1.png", PNG_BYTES);
  const zipBytes = new Uint8Array(
    await zip.generateAsync({ type: "uint8array" })
  );
  console.log(`[setup] in-memory zip = ${zipBytes.byteLength} bytes`);

  // --- Stage 1: parse ---------------------------------------------------
  const bundle = await parseBundle(zipBytes);
  assert(
    bundle.bundleErrors.length === 0,
    `bundle errors: ${bundle.bundleErrors.join("; ")}`
  );
  assert(bundle.problems.length === 2, `parsed ${bundle.problems.length}, want 2`);
  assert(bundle.images.size === 1, `parsed ${bundle.images.size} images, want 1`);
  console.log(`[1] parseBundle ok: 2 problems, 1 image`);

  // --- Stage 2: validate ------------------------------------------------
  const report = await validateBundle(bundle);
  assert(
    report.errorCount === 0,
    `validation errors: ${JSON.stringify(report.problems.filter((p) => p.status === "error"))}`
  );
  console.log(`[2] validate ok: ${report.okCount} ok / ${report.errorCount} err`);

  // --- Stage 3: execute -------------------------------------------------
  const exec = await executeImport({
    bundle,
    validation: report,
    uploadedBy: admin.id,
  });
  assert(
    exec.successCount === 2,
    `success=${exec.successCount}, want 2 (errorLog=${JSON.stringify(exec.errorLog)})`
  );
  assert(exec.createdCodes.length === 2, `createdCodes len=${exec.createdCodes.length}`);
  console.log(`[3] executeImport: ${exec.successCount}/${exec.totalCount} → ${exec.createdCodes.join(", ")}`);

  // --- DB verification --------------------------------------------------
  const inserted = await db
    .select()
    .from(problems)
    .where(inArray(problems.code, exec.createdCodes));
  assert(inserted.length === 2, `inserted ${inserted.length}, want 2`);

  const sample = inserted.find((p) => /r2\.dev|imports\//.test(p.bodyMd));
  assert(sample, "no problem with rewritten image reference found");
  console.log(`[4] image markdown ref rewritten to R2 URL`);

  const insertedImages = await db
    .select()
    .from(images)
    .where(inArray(images.problemId, inserted.map((p) => p.id)));
  assert(insertedImages.length === 1, `image rows=${insertedImages.length}, want 1`);
  console.log(`[5] ${insertedImages.length} image row persisted`);

  // --- splitProblemBlocks unit-ish check --------------------------------
  const text = "---\nfoo: 1\n---\n\nbody1\n\n---\nfoo: 2\n---\n\nbody2";
  const blocks = splitProblemBlocks(text);
  assert(blocks.length === 2, `splitProblemBlocks returned ${blocks.length}, want 2`);
  console.log(`[6] splitProblemBlocks correctly handles multi-problem text`);

  // --- Cleanup ----------------------------------------------------------
  for (const img of insertedImages) {
    try {
      await deleteFile(img.storageKey);
    } catch {
      // best-effort
    }
  }
  await db.delete(problems).where(inArray(problems.id, inserted.map((p) => p.id)));
  console.log(`[cleanup] removed ${inserted.length} problems, ${insertedImages.length} R2 objects`);
  void eq;

  console.log(`\nImport smoke: PASSED`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Import smoke FAILED:", e);
  process.exit(1);
});
