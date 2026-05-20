// E2E smoke for topics XLSX import.
//
// Exercises parseTopicsXlsx + validateTopicsBundle on three scenarios
// (clean / bundle-error / row-errors) and bulkCreateTopics on a clean
// payload. Cleans up the topics it creates.
//
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/topics-xlsx-smoke.ts

import "../src/db/load-env";

import ExcelJS from "exceljs";
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { topics } from "../src/db/schema";
import {
  parseTopicsXlsx,
  validateTopicsBundle,
} from "../src/lib/taxonomy/topics-xlsx";
import { bulkCreateTopics } from "../src/lib/taxonomy/mutations";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

async function buildXlsx(
  rows: Array<{ name: unknown; parent_id: unknown; description: unknown }>,
  opts: { headers?: string[] } = {}
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Mavzular");
  const headers = opts.headers ?? ["name", "parent_id", "description"];
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow([row.name, row.parent_id, row.description]);
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf);
}

const SUFFIX = `smoke-${Date.now()}`;

async function main() {
  // Find any real existing topic to use as a parent reference. We'll
  // attach our synthetic children to it so the validator finds the parent.
  const [parent] = await db.select({ id: topics.id, code: topics.code })
    .from(topics)
    .limit(1);
  assert(parent, "topics table empty — run npm run db:seed");

  // --- Scenario A: clean file ----------------------------------------------
  const cleanBytes = await buildXlsx([
    { name: `A ${SUFFIX}`, parent_id: "0", description: "Smoke root" },
    {
      name: `B ${SUFFIX}`,
      parent_id: parent.code,
      description: "Smoke child",
    },
  ]);
  const cleanParsed = await parseTopicsXlsx(cleanBytes);
  assert(
    cleanParsed.bundleErrors.length === 0,
    `A: unexpected bundle errors ${JSON.stringify(cleanParsed.bundleErrors)}`
  );
  assert(cleanParsed.rows.length === 2, "A: expected 2 parsed rows");
  const cleanReport = await validateTopicsBundle(cleanParsed);
  assert(
    cleanReport.errorCount === 0,
    `A: unexpected row errors ${JSON.stringify(
      cleanReport.rows.map((r) => r.errors)
    )}`
  );
  assert(cleanReport.okCount === 2, "A: expected 2 ok rows");
  console.log("[1] clean parse + validate ok");

  // --- Scenario B: bundle errors ------------------------------------------
  // Missing the `name` header.
  const badHeaderBytes = await buildXlsx(
    [{ name: "x", parent_id: "0", description: "" }],
    { headers: ["wrong_name", "parent_id", "description"] }
  );
  const badHeaderParsed = await parseTopicsXlsx(badHeaderBytes);
  assert(
    badHeaderParsed.bundleErrors.some((e) => e.includes("name")),
    `B: expected missing-name bundle error, got ${JSON.stringify(
      badHeaderParsed.bundleErrors
    )}`
  );
  console.log("[2] bundle error on missing header ok");

  // --- Scenario C: row errors ---------------------------------------------
  const dirtyBytes = await buildXlsx([
    // 1: name empty
    { name: "  ", parent_id: "0", description: "" },
    // 2: parent_id malformed
    { name: `C1 ${SUFFIX}`, parent_id: "abc", description: "" },
    // 3: parent_id well-formed but not in DB
    { name: `C2 ${SUFFIX}`, parent_id: "T999999", description: "" },
    // 4 & 5: in-file duplicate (same name, same root parent)
    { name: `C3 ${SUFFIX}`, parent_id: "0", description: "" },
    { name: `C3 ${SUFFIX}`, parent_id: "0", description: "" },
    // 6: name too long
    { name: "x".repeat(101), parent_id: "0", description: "" },
    // 7: description too long
    { name: `C5 ${SUFFIX}`, parent_id: "0", description: "y".repeat(1001) },
  ]);
  const dirtyParsed = await parseTopicsXlsx(dirtyBytes);
  assert(dirtyParsed.bundleErrors.length === 0, "C: no bundle errors expected");
  const dirtyReport = await validateTopicsBundle(dirtyParsed);
  assert(
    dirtyReport.errorCount === 7,
    `C: expected 7 row errors, got ${dirtyReport.errorCount}`
  );
  // Spot-check error messages.
  const r1 = dirtyReport.rows[0];
  assert(r1.errors.some((e) => e.includes("bo'sh")), "C row1: empty-name msg");
  const r2 = dirtyReport.rows[1];
  assert(
    r2.errors.some((e) => e.toLowerCase().includes("format")),
    "C row2: format msg"
  );
  const r3 = dirtyReport.rows[2];
  assert(r3.errors.some((e) => e.includes("T999999")), "C row3: parent msg");
  assert(
    dirtyReport.rows[3].errors.some((e) => e.includes("dublikat")) &&
      dirtyReport.rows[4].errors.some((e) => e.includes("dublikat")),
    "C rows 4/5: in-file dup msg"
  );
  assert(
    dirtyReport.rows[6].errors.some((e) => e.includes("Ta'rif")),
    "C row7: description-length msg"
  );
  console.log("[3] row-level errors ok");

  // --- Scenario D: bulkCreateTopics ---------------------------------------
  const okInputs = cleanReport.rows
    .filter((r) => r.status === "ok")
    .map((r) => ({
      name: r.name,
      parentId: r.parentId,
      description: r.description,
    }));
  const { createdCodes } = await bulkCreateTopics(okInputs);
  assert(createdCodes.length === 2, "D: expected 2 created codes");
  assert(
    createdCodes.every((c) => /^T\d{6,}$/.test(c)),
    "D: codes shape"
  );
  const persisted = await db
    .select({ id: topics.id, code: topics.code, name: topics.name })
    .from(topics)
    .where(inArray(topics.code, createdCodes));
  assert(persisted.length === 2, "D: rows missing from DB");
  console.log(`[4] bulk insert ok (created ${createdCodes.join(", ")})`);

  // --- Cleanup ------------------------------------------------------------
  for (const code of createdCodes) {
    await db.delete(topics).where(eq(topics.code, code));
  }
  console.log("[5] cleanup ok");

  console.log("Smoke: PASSED");
}

main()
  .catch((err) => {
    console.error(err);
    console.log("Smoke: FAILED");
    process.exit(1);
  })
  .then(() => process.exit(0));
