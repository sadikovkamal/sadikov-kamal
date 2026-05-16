# Topics XLSX Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin can bulk-add topics on `/admin/topics` by uploading an `.xlsx` file. Three-stage modal: pick file → see validation report → confirm and execute. Insert-only; `parent_id` references existing `T######` codes (or `0` for root).

**Architecture:** Server-side XLSX parsing with `exceljs`. Pure parse/validate functions in `src/lib/taxonomy/topics-xlsx.ts`. Two server actions mirror the existing problem-import pattern. New `bulkCreateTopics` transactional mutation assigns sequential `T######` codes in one batch insert. Template download served by a Node-runtime route handler. UI is a single new client component mounted from the topics tree.

**Tech Stack:** Next.js 16, React 19, Drizzle ORM, postgres-js, `exceljs` (new), Base UI Dialog, server-only actions.

**Spec:** [2026-05-16-topics-xlsx-import-design.md](../specs/2026-05-16-topics-xlsx-import-design.md)

**Codebase conventions you must follow:**
- No unit tests in this repo. Smoke scripts under `scripts/*-smoke.ts` are the verification mechanism. Each smoke script prints `Smoke: PASSED` on success or throws. Add new smokes there and register them in `scripts/run-all-smokes.sh`.
- Server-only modules begin with `import "server-only";` so accidental client imports throw at build time. Smoke scripts run with `NODE_OPTIONS="--conditions=react-server"` to bypass the throw.
- Drizzle's `db` (single shared client) lives at `@/db`. Schema re-exported from `@/db/schema`.
- Topic codes are minted via `nextTopicCode` in [src/lib/taxonomy/topic-codes.ts](src/lib/taxonomy/topic-codes.ts); never roll your own.
- UI text is Uzbek (latin script). Match the tone of the existing topics page.
- Route handlers go under `src/app/api/.../route.ts` (mirror [src/app/api/import-template/route.ts](src/app/api/import-template/route.ts)). The spec mentioned `/admin/topics/import-template/route.ts` but the convention here is `/api/`. We use `/api/topics-import-template/route.ts`.

---

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `src/lib/taxonomy/topics-xlsx.ts` | Server-only. Two pure functions: `parseTopicsXlsx(bytes)` → `ParsedBundle`; `validateTopicsBundle(parsed)` → `ValidationReport`. No DB writes, no React. |
| `src/app/admin/topics/_import-actions.ts` | Server actions: `previewTopicsImportAction`, `executeTopicsImportAction`. Mirror shape of `src/app/admin/problems/new/_actions.ts`. |
| `src/app/admin/topics/topic-import-dialog.tsx` | Client component. 3-stage modal (pick → validate → result). |
| `src/app/api/topics-import-template/route.ts` | GET handler that generates the example XLSX with `exceljs` and serves it. |
| `scripts/topics-xlsx-smoke.ts` | E2E smoke covering parse, validate (clean + dirty paths), and `bulkCreateTopics`. |

**Modified files:**

| Path | Change |
|---|---|
| `package.json` | Add `exceljs` dependency. |
| `src/lib/taxonomy/mutations.ts` | Add `bulkCreateTopics(inputs)` — single transaction, sequential codes, one INSERT. |
| `src/app/admin/topics/topics-tree.tsx` | Add "XLSX import" button and open-state for the new dialog. |
| `scripts/run-all-smokes.sh` | Register `topics-xlsx-smoke.ts` in the `SERVER_ONLY` group. |

---

## Task 1: Add the exceljs dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install exceljs**

Run from the repo root:

```bash
npm install exceljs@^4.4.0
```

- [ ] **Step 2: Verify install succeeded**

Run:

```bash
node -e "console.log(require('exceljs').version || require('exceljs/package.json').version)"
```

Expected: a version number like `4.4.0` prints; no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add exceljs for XLSX parsing in topics import"
```

---

## Task 2: Create the topics-xlsx parser module skeleton

**Files:**
- Create: `src/lib/taxonomy/topics-xlsx.ts`

- [ ] **Step 1: Create the file with types and exports**

Create `src/lib/taxonomy/topics-xlsx.ts`:

```ts
import "server-only";

import ExcelJS from "exceljs";
import { inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { topics } from "@/db/schema";
import { TOPIC_CODE_REGEX } from "./topic-codes";

/** Per-row shape after raw parsing. parentCode is null for root rows. */
export interface ParsedRow {
  /** 1-based Excel row number (header is 1, first data row is 2). */
  excelRow: number;
  name: string;
  parentCode: string | null;
  description: string | null;
}

export interface ParsedBundle {
  rows: ParsedRow[];
  bundleErrors: string[];
}

/** Row after validation, with resolved parentId (UUID) when applicable. */
export interface ValidatedRow {
  excelRow: number;
  name: string;
  parentCode: string | null;
  parentId: string | null;
  description: string | null;
  status: "ok" | "error";
  errors: string[];
}

export interface ValidationReport {
  bundleErrors: string[];
  rows: ValidatedRow[];
  okCount: number;
  errorCount: number;
}

export const MAX_ROWS = 500;
export const MAX_NAME_LEN = 100;
export const MAX_DESCRIPTION_LEN = 1000;
export const REQUIRED_HEADERS = ["name", "parent_id", "description"] as const;

export async function parseTopicsXlsx(
  _bytes: Uint8Array
): Promise<ParsedBundle> {
  throw new Error("not implemented");
}

export async function validateTopicsBundle(
  _parsed: ParsedBundle
): Promise<ValidationReport> {
  throw new Error("not implemented");
}
```

- [ ] **Step 2: Verify the file type-checks**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors. (If `ExcelJS` import errors, exceljs install failed — go back to Task 1.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/taxonomy/topics-xlsx.ts
git commit -m "feat(taxonomy): scaffold topics-xlsx parse/validate module"
```

---

## Task 3: Implement parseTopicsXlsx

**Files:**
- Modify: `src/lib/taxonomy/topics-xlsx.ts`

- [ ] **Step 1: Replace the parseTopicsXlsx stub**

In `src/lib/taxonomy/topics-xlsx.ts`, replace the `parseTopicsXlsx` function with:

```ts
export async function parseTopicsXlsx(
  bytes: Uint8Array
): Promise<ParsedBundle> {
  const bundleErrors: string[] = [];
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs accepts an ArrayBuffer; pass the underlying buffer.
    await workbook.xlsx.load(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    );
  } catch {
    return { rows: [], bundleErrors: ["XLSX fayl o'qib bo'lmadi"] };
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { rows: [], bundleErrors: ["Faylda hech qanday sheet topilmadi"] };
  }

  const headerRow = sheet.getRow(1);
  const headerToCol = new Map<string, number>();
  headerRow.eachCell((cell, col) => {
    const raw = cell.value;
    if (typeof raw === "string") {
      headerToCol.set(raw.trim().toLowerCase(), col);
    }
  });

  for (const required of REQUIRED_HEADERS) {
    if (!headerToCol.has(required)) {
      bundleErrors.push(`Header topilmadi: ${required}`);
    }
  }
  if (bundleErrors.length > 0) {
    return { rows: [], bundleErrors };
  }

  const nameCol = headerToCol.get("name")!;
  const parentCol = headerToCol.get("parent_id")!;
  const descCol = headerToCol.get("description")!;

  const rows: ParsedRow[] = [];
  // exceljs row numbers are 1-based; row 1 is the header.
  for (let r = 2; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const nameRaw = cellToString(row.getCell(nameCol).value);
    const parentRaw = cellToString(row.getCell(parentCol).value);
    const descRaw = cellToString(row.getCell(descCol).value);

    const name = nameRaw.trim();
    const parentTrim = parentRaw.trim();
    const description = descRaw.trim();

    // Treat fully blank rows as absent — Excel often pads trailing rows.
    if (name === "" && parentTrim === "" && description === "") continue;

    const parentCode =
      parentTrim === "" || parentTrim === "0" ? null : parentTrim;

    rows.push({
      excelRow: r,
      name,
      parentCode,
      description: description === "" ? null : description,
    });
  }

  if (rows.length === 0) {
    bundleErrors.push("Faylda hech qanday qator topilmadi");
  } else if (rows.length > MAX_ROWS) {
    bundleErrors.push(
      `Maksimum ${MAX_ROWS} qator. Faylda ${rows.length} qator bor.`
    );
  }

  return { rows, bundleErrors };
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  // exceljs sometimes returns { richText: [...] } or { result: ... } for formulas.
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((rt) => rt.text ?? "").join("");
    }
    if ("result" in value && value.result != null) {
      return String(value.result);
    }
    if ("text" in value && typeof value.text === "string") {
      return value.text;
    }
  }
  return "";
}
```

- [ ] **Step 2: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/taxonomy/topics-xlsx.ts
git commit -m "feat(taxonomy): implement parseTopicsXlsx — header check, row extraction, row cap"
```

---

## Task 4: Implement validateTopicsBundle

**Files:**
- Modify: `src/lib/taxonomy/topics-xlsx.ts`

- [ ] **Step 1: Replace the validateTopicsBundle stub**

In `src/lib/taxonomy/topics-xlsx.ts`, replace the `validateTopicsBundle` function with:

```ts
export async function validateTopicsBundle(
  parsed: ParsedBundle
): Promise<ValidationReport> {
  // Bundle errors fail the whole file before we touch the DB.
  if (parsed.bundleErrors.length > 0 || parsed.rows.length === 0) {
    return {
      bundleErrors: parsed.bundleErrors,
      rows: [],
      okCount: 0,
      errorCount: 0,
    };
  }

  // Resolve all referenced parent codes in one DB round-trip.
  const referencedCodes = Array.from(
    new Set(
      parsed.rows
        .map((r) => r.parentCode)
        .filter((c): c is string => c != null && TOPIC_CODE_REGEX.test(c))
    )
  );

  const existingParents = referencedCodes.length
    ? await db
        .select({ id: topics.id, code: topics.code })
        .from(topics)
        .where(inArray(topics.code, referencedCodes))
    : [];
  const parentIdByCode = new Map<string, string>(
    existingParents.map((p) => [p.code, p.id])
  );

  // Build the set of (lower(name), parent_id) pairs we'd be inserting.
  // We need the resolved parent UUID (or null for root) to compare against DB.
  type Key = string; // `lower(name)|<uuid-or-NULL>`
  const keyFor = (lowerName: string, parentId: string | null): Key =>
    `${lowerName}|${parentId ?? "NULL"}`;

  // Track in-file dupes by key.
  const inFileSeen = new Map<Key, number[]>();

  // First pass: catch format / length / missing-parent / in-file dup keys.
  const interim: ValidatedRow[] = parsed.rows.map((row) => {
    const errors: string[] = [];

    if (row.name === "") {
      errors.push("Nomi bo'sh");
    } else if (row.name.length > MAX_NAME_LEN) {
      errors.push(`Nomi ${MAX_NAME_LEN} belgidan oshmasligi kerak`);
    }

    let parentId: string | null = null;
    if (row.parentCode == null) {
      parentId = null;
    } else if (!TOPIC_CODE_REGEX.test(row.parentCode)) {
      errors.push("parent_id formati noto'g'ri (0 yoki T###### kutilgan)");
    } else {
      const resolved = parentIdByCode.get(row.parentCode);
      if (!resolved) {
        errors.push(`Bunday parent topilmadi: ${row.parentCode}`);
      } else {
        parentId = resolved;
      }
    }

    if (
      row.description != null &&
      row.description.length > MAX_DESCRIPTION_LEN
    ) {
      errors.push(
        `Ta'rif ${MAX_DESCRIPTION_LEN} belgidan oshmasligi kerak`
      );
    }

    return {
      excelRow: row.excelRow,
      name: row.name,
      parentCode: row.parentCode,
      parentId,
      description: row.description,
      status: errors.length === 0 ? "ok" : "error",
      errors,
    };
  });

  // Second pass: mark in-file duplicates. Only consider rows that have a
  // name and a resolved parent (or null root); other rows are already
  // errored out and skipping them avoids spurious "dublikat" noise.
  for (const r of interim) {
    if (r.name === "") continue;
    if (r.parentCode != null && r.parentId == null) continue;
    const key = keyFor(r.name.toLowerCase(), r.parentId);
    const list = inFileSeen.get(key) ?? [];
    list.push(r.excelRow);
    inFileSeen.set(key, list);
  }
  for (const [, list] of inFileSeen) {
    if (list.length > 1) {
      for (const excelRow of list) {
        const r = interim.find((x) => x.excelRow === excelRow)!;
        r.errors.push("Fayl ichida dublikat");
        r.status = "error";
      }
    }
  }

  // Third pass: cross-check against DB. Build the candidate (lower-name,
  // parent_id) pairs from rows that are still ok.
  const candidatePairs: Array<{ nameLower: string; parentId: string | null }> =
    [];
  for (const r of interim) {
    if (r.status !== "ok") continue;
    candidatePairs.push({
      nameLower: r.name.toLowerCase(),
      parentId: r.parentId,
    });
  }

  if (candidatePairs.length > 0) {
    // Postgres can't compare (text, uuid) tuples mixed with NULLs via IN.
    // Split into two queries: rows with a parent, and root rows.
    const withParent = candidatePairs.filter((p) => p.parentId != null);
    const rootOnes = candidatePairs.filter((p) => p.parentId == null);

    const hits = new Set<Key>();

    if (withParent.length > 0) {
      const names = withParent.map((p) => p.nameLower);
      const parents = withParent.map((p) => p.parentId as string);
      // Postgres-side: unnest the two parallel arrays into a (text, uuid)
      // table, then join. Single round-trip regardless of input size.
      const rows = (await db.execute(
        sql`
          SELECT lower(${topics.name}) AS name_lower,
                 ${topics.parentId}::text AS parent_id
          FROM ${topics}
          WHERE (lower(${topics.name}), ${topics.parentId}) IN (
            SELECT * FROM unnest(${names}::text[], ${parents}::uuid[])
          )
        `
      )) as unknown as Array<{ name_lower: string; parent_id: string }>;
      for (const row of rows) {
        hits.add(keyFor(row.name_lower, row.parent_id));
      }
    }

    if (rootOnes.length > 0) {
      const names = rootOnes.map((p) => p.nameLower);
      const rows = (await db.execute(
        sql`
          SELECT lower(${topics.name}) AS name_lower
          FROM ${topics}
          WHERE ${topics.parentId} IS NULL
            AND lower(${topics.name}) = ANY(${names}::text[])
        `
      )) as unknown as Array<{ name_lower: string }>;
      for (const row of rows) {
        hits.add(keyFor(row.name_lower, null));
      }
    }

    for (const r of interim) {
      if (r.status !== "ok") continue;
      const key = keyFor(r.name.toLowerCase(), r.parentId);
      if (hits.has(key)) {
        r.errors.push("Bazada allaqachon bor");
        r.status = "error";
      }
    }
  }

  let okCount = 0;
  let errorCount = 0;
  for (const r of interim) {
    if (r.status === "ok") okCount += 1;
    else errorCount += 1;
  }

  return {
    bundleErrors: [],
    rows: interim,
    okCount,
    errorCount,
  };
}
```

- [ ] **Step 2: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/taxonomy/topics-xlsx.ts
git commit -m "feat(taxonomy): implement validateTopicsBundle with single-roundtrip DB checks"
```

---

## Task 5: Add bulkCreateTopics mutation

**Files:**
- Modify: `src/lib/taxonomy/mutations.ts`

- [ ] **Step 1: Read the current mutations.ts file**

Read `src/lib/taxonomy/mutations.ts` to confirm the imports already present.

- [ ] **Step 2: Append bulkCreateTopics to the file**

At the end of the `// --- Topics ---` section in `src/lib/taxonomy/mutations.ts` (after `deleteTopic`), add:

```ts
export interface BulkTopicInput {
  name: string;
  parentId: string | null;
  description: string | null;
}

/**
 * Insert many topics in one transaction. All-or-nothing: any DB error
 * (including the UNIQUE collision two parallel admins could race into)
 * rolls back the batch — the action layer surfaces a friendly error
 * and the admin retries.
 *
 * Codes are minted sequentially in memory after one max(code) read,
 * then inserted in one VALUES (...), (...) statement.
 */
export async function bulkCreateTopics(
  inputs: BulkTopicInput[]
): Promise<{ createdCodes: string[] }> {
  if (inputs.length === 0) return { createdCodes: [] };

  return db.transaction(async (tx) => {
    const [maxRow] = await tx
      .select({ maxCode: sql<string | null>`max(${topics.code})` })
      .from(topics);

    let runningMax = maxRow.maxCode ?? "";
    const withCodes = inputs.map((input) => {
      const code = nextTopicCode(runningMax ? [runningMax] : []);
      runningMax = code;
      return { ...input, code };
    });

    const inserted = await tx
      .insert(topics)
      .values(withCodes)
      .returning({ code: topics.code });

    return { createdCodes: inserted.map((r) => r.code) };
  });
}
```

- [ ] **Step 3: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors. (If `db.transaction` types complain, confirm `db` from `@/db` exposes `.transaction` — see [src/lib/import/execute.ts](src/lib/import/execute.ts) for a working example.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/taxonomy/mutations.ts
git commit -m "feat(taxonomy): add bulkCreateTopics — single transaction, sequential codes"
```

---

## Task 6: Write the topics XLSX smoke script

**Files:**
- Create: `scripts/topics-xlsx-smoke.ts`

- [ ] **Step 1: Create the smoke script**

Create `scripts/topics-xlsx-smoke.ts`:

```ts
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
  ]);
  const dirtyParsed = await parseTopicsXlsx(dirtyBytes);
  assert(dirtyParsed.bundleErrors.length === 0, "C: no bundle errors expected");
  const dirtyReport = await validateTopicsBundle(dirtyParsed);
  assert(
    dirtyReport.errorCount === 6,
    `C: expected 6 row errors, got ${dirtyReport.errorCount}`
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
```

- [ ] **Step 2: Register the smoke in run-all-smokes.sh**

In `scripts/run-all-smokes.sh`, add `"topics-xlsx-smoke.ts"` to the `SERVER_ONLY` array. The relevant block becomes:

```bash
SERVER_ONLY=(
  "problems-smoke.ts"
  "problems-page-smoke.ts"
  "list-smoke.ts"
  "list-page-smoke.ts"
  "import-smoke.ts"
  "import-failure-smoke.ts"
  "taxonomy-smoke.ts"
  "rate-limit-smoke.ts"
  "topics-xlsx-smoke.ts"
)
```

- [ ] **Step 3: Run the smoke**

Run from the repo root:

```bash
NODE_OPTIONS="--conditions=react-server" npx tsx scripts/topics-xlsx-smoke.ts
```

Expected: `[1] ... ok` through `[5] cleanup ok` then `Smoke: PASSED`. No assertion failures.

- [ ] **Step 4: Commit**

```bash
git add scripts/topics-xlsx-smoke.ts scripts/run-all-smokes.sh
git commit -m "test: smoke for topics XLSX parse, validate, bulk insert"
```

---

## Task 7: Create the server actions

**Files:**
- Create: `src/app/admin/topics/_import-actions.ts`

- [ ] **Step 1: Create the actions file**

Create `src/app/admin/topics/_import-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  parseTopicsXlsx,
  validateTopicsBundle,
  type ValidationReport,
} from "@/lib/taxonomy/topics-xlsx";
import { bulkCreateTopics } from "@/lib/taxonomy/mutations";

export interface PreviewSuccess {
  success: true;
  filename: string;
  size: number;
  validation: ValidationReport;
  parsedSummary: { rowCount: number };
}
export type PreviewResult = PreviewSuccess | { error: string };

export interface ExecuteSuccess {
  success: true;
  successCount: number;
  createdCodes: string[];
}
export type ExecuteResult = ExecuteSuccess | { error: string };

/**
 * Stage 1: parse + validate, return a report. No writes. Client keeps the
 * File in memory and re-sends it on execute — same pattern as the problem
 * importer. We re-parse on stage 2 rather than trust the report shape.
 */
export async function previewTopicsImportAction(
  formData: FormData
): Promise<PreviewResult> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "Fayl yuklanmadi" };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const parsed = await parseTopicsXlsx(bytes);
  const validation = await validateTopicsBundle(parsed);

  return {
    success: true,
    filename: file.name,
    size: file.size,
    validation,
    parsedSummary: { rowCount: parsed.rows.length },
  };
}

/**
 * Stage 2: insert only when validation is fully clean. We re-validate
 * here so a tampered client can't bypass row errors.
 */
export async function executeTopicsImportAction(
  formData: FormData
): Promise<ExecuteResult> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "Fayl yuklanmadi" };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const parsed = await parseTopicsXlsx(bytes);
  const validation = await validateTopicsBundle(parsed);

  if (validation.bundleErrors.length > 0 || validation.errorCount > 0) {
    return {
      error:
        "Faylda xatolik bor. Avval xatolarni tuzating, so'ng qaytadan urinib ko'ring.",
    };
  }

  const inputs = validation.rows.map((r) => ({
    name: r.name,
    parentId: r.parentId,
    description: r.description,
  }));

  if (inputs.length === 0) {
    return { error: "Faylda hech qanday mavzu topilmadi" };
  }

  try {
    const { createdCodes } = await bulkCreateTopics(inputs);
    revalidatePath("/admin/topics");
    revalidatePath("/admin");
    return {
      success: true,
      successCount: createdCodes.length,
      createdCodes,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/unique/i.test(msg) || /23505/.test(msg)) {
      return {
        error:
          "Saqlash paytida nom to'qnashuvi yuz berdi. Qaytadan urinib ko'ring.",
      };
    }
    return { error: "Saqlash muvaffaqiyatsiz tugadi" };
  }
}
```

- [ ] **Step 2: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/topics/_import-actions.ts
git commit -m "feat(admin): topics XLSX import server actions (preview + execute)"
```

---

## Task 8: Create the template route handler

**Files:**
- Create: `src/app/api/topics-import-template/route.ts`

- [ ] **Step 1: Create the route**

Create `src/app/api/topics-import-template/route.ts`:

```ts
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/auth";

// Generated on every request so the template stays in sync with the
// import contract; the file is tiny so caching isn't worth the staleness
// risk. exceljs uses Buffer → force the Node runtime.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Returns a starter `.xlsx` for the topics importer. Admin-only — matches
 * the gating on `/admin/topics`. Two example rows show both a root entry
 * and a child under an existing parent code; admins replace them.
 */
export async function GET() {
  await requireAdmin();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Mavzular");
  sheet.columns = [
    { header: "name", key: "name", width: 40 },
    { header: "parent_id", key: "parent_id", width: 16 },
    { header: "description", key: "description", width: 60 },
  ];
  sheet.addRow({
    name: "Misol: Geometriya",
    parent_id: 0,
    description: "Yangi root mavzu",
  });
  sheet.addRow({
    name: "Misol: Uchburchaklar",
    parent_id: "T000001",
    description: "Mavjud T000001 ostiga bola",
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="mavzular-namuna.xlsx"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
```

- [ ] **Step 2: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/topics-import-template/route.ts
git commit -m "feat(admin): topics XLSX template download route"
```

---

## Task 9: Build the import dialog client component

**Files:**
- Create: `src/app/admin/topics/topic-import-dialog.tsx`

- [ ] **Step 1: Create the dialog component**

Create `src/app/admin/topics/topic-import-dialog.tsx`:

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  previewTopicsImportAction,
  executeTopicsImportAction,
  type PreviewSuccess,
  type ExecuteSuccess,
} from "./_import-actions";

/**
 * Three-stage modal: pick → validate → confirm → result. Mirrors the
 * problem ZIP importer at /admin/problems/new but specialized for the
 * topics XLSX schema (no images, no bundle archive).
 */
export function TopicImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewSuccess | null>(null);
  const [success, setSuccess] = useState<ExecuteSuccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPreviewing, startPreview] = useTransition();
  const [isImporting, startImport] = useTransition();

  function reset() {
    setFile(null);
    setPreview(null);
    setSuccess(null);
    setError(null);
    setConfirmOpen(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function closeAll() {
    reset();
    onOpenChange(false);
  }

  function onPreview() {
    if (!file) return;
    setError(null);
    setPreview(null);
    setSuccess(null);
    startPreview(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await previewTopicsImportAction(fd);
      if ("error" in res) {
        setError(res.error);
      } else {
        setPreview(res);
      }
    });
  }

  function onExecute() {
    if (!file) return;
    setError(null);
    startImport(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await executeTopicsImportAction(fd);
      if ("error" in res) {
        setError(res.error);
        setConfirmOpen(false);
      } else {
        setPreview(null);
        setConfirmOpen(false);
        setSuccess(res);
        router.refresh();
      }
    });
  }

  const validation = preview?.validation ?? null;
  const isClean =
    !!validation &&
    validation.bundleErrors.length === 0 &&
    validation.errorCount === 0 &&
    validation.okCount > 0;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o && !isImporting) closeAll();
          else onOpenChange(o);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>XLSX dan mavzularni import qilish</DialogTitle>
            <DialogDescription>
              Ustunlar: <code>name</code>, <code>parent_id</code>,{" "}
              <code>description</code>. Root mavzu uchun{" "}
              <code>parent_id = 0</code>; aks holda mavjud{" "}
              <code>T######</code> kodi.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <a
              href="/api/topics-import-template"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              <FileSpreadsheet className="size-3.5" aria-hidden />
              Namuna XLSX yuklab olish
            </a>

            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              disabled={isPreviewing || isImporting}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setSuccess(null);
                setError(null);
              }}
            />

            {file ? (
              <div className="flex items-center gap-2.5 rounded-lg ring-1 ring-foreground/10 bg-card px-3 py-2">
                <div className="rounded-md bg-muted p-1.5 shrink-0">
                  <FileSpreadsheet
                    className="size-4 text-muted-foreground"
                    aria-hidden
                  />
                </div>
                <div className="flex-1 min-w-0 text-sm">
                  <p className="font-medium truncate">{file.name}</p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Faylni olib tashlash"
                  disabled={isPreviewing || isImporting}
                  onClick={() => {
                    setFile(null);
                    setPreview(null);
                    setError(null);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={isPreviewing || isImporting}
                className="w-full flex flex-col items-center justify-center gap-1.5 rounded-lg ring-1 ring-dashed ring-foreground/15 bg-card/40 hover:bg-card hover:ring-foreground/25 transition-colors px-4 py-6 text-center disabled:opacity-50"
              >
                <Upload className="size-4 text-muted-foreground" aria-hidden />
                <span className="text-sm font-medium">Faylni tanlang</span>
                <span className="text-xs text-muted-foreground">.xlsx</span>
              </button>
            )}

            {!validation && (
              <Button
                onClick={onPreview}
                disabled={!file || isPreviewing || isImporting}
                className="w-full"
              >
                {isPreviewing ? (
                  <>
                    <Loader2
                      data-icon="inline-start"
                      className="animate-spin"
                    />
                    Tekshirilmoqda…
                  </>
                ) : (
                  "Tekshirish"
                )}
              </Button>
            )}

            {validation && (
              <ValidationDetails
                validation={validation}
                parsed={preview!.parsedSummary}
              />
            )}

            {error && (
              <p className="text-xs text-destructive leading-relaxed">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeAll}
              disabled={isImporting}
            >
              Yopish
            </Button>
            {isClean && (
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={isImporting}
              >
                Importni boshlash
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm */}
      <Dialog
        open={confirmOpen}
        onOpenChange={(o) => {
          if (!isImporting) setConfirmOpen(o);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Tasdiqlash</DialogTitle>
            <DialogDescription>
              {validation?.okCount} ta mavzu bazaga qo&apos;shiladi. Davom
              etamizmi?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={isImporting}
            >
              Bekor qilish
            </Button>
            <Button onClick={onExecute} disabled={isImporting}>
              {isImporting ? (
                <>
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                  Qo&apos;shilmoqda…
                </>
              ) : (
                "Ha, qo'shamiz"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success */}
      <Dialog
        open={!!success}
        onOpenChange={(o) => {
          if (!o) closeAll();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2
                className="size-4 text-emerald-600"
                aria-hidden
              />
              {success?.successCount} ta mavzu qo&apos;shildi
            </DialogTitle>
            <DialogDescription>
              Yangi mavzu kodlari quyida.
            </DialogDescription>
          </DialogHeader>
          {success && success.createdCodes.length > 0 && (
            <div className="max-h-48 overflow-auto rounded-md ring-1 ring-foreground/10 bg-muted/30 px-3 py-2">
              <div className="flex flex-wrap gap-1.5">
                {success.createdCodes.map((c) => (
                  <code
                    key={c}
                    className="inline-flex items-center rounded bg-card px-1.5 py-0.5 text-[10px] font-mono tabular-nums ring-1 ring-foreground/10"
                  >
                    {c}
                  </code>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => reset()}>
              Yana yuklash
            </Button>
            <Button onClick={closeAll}>Yopish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ValidationDetails({
  validation,
  parsed,
}: {
  validation: NonNullable<PreviewSuccess["validation"]>;
  parsed: PreviewSuccess["parsedSummary"];
}) {
  const isClean =
    validation.bundleErrors.length === 0 && validation.errorCount === 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <SummaryChip label="Jami" value={parsed.rowCount} />
        {validation.okCount > 0 && (
          <SummaryChip
            label="To'g'ri"
            value={validation.okCount}
            tone="success"
          />
        )}
        {validation.errorCount > 0 && (
          <SummaryChip
            label="Xato"
            value={validation.errorCount}
            tone="error"
          />
        )}
      </div>

      {isClean ? (
        <div className="rounded-md ring-1 ring-emerald-500/30 bg-emerald-500/5 p-3 text-xs flex items-center gap-2">
          <CheckCircle2
            className="size-4 text-emerald-600 shrink-0"
            aria-hidden
          />
          <span>Fayl tayyor. {`"Importni boshlash"`} ni bosing.</span>
        </div>
      ) : null}

      {validation.bundleErrors.length > 0 && (
        <div className="rounded-md ring-1 ring-destructive/30 bg-destructive/5 p-3 text-xs space-y-1">
          <p className="font-medium text-destructive flex items-center gap-1.5">
            <AlertTriangle className="size-3.5" aria-hidden />
            Fayl darajasidagi xatolar
          </p>
          <ul className="list-disc ml-4 text-destructive/90">
            {validation.bundleErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {validation.errorCount > 0 && (
        <div className="space-y-1.5 max-h-64 overflow-auto">
          {validation.rows
            .filter((r) => r.status === "error")
            .map((r) => (
              <div
                key={r.excelRow}
                className="rounded-md ring-1 ring-destructive/30 bg-destructive/5 p-2 text-xs"
              >
                <p className="font-mono text-[10px] text-muted-foreground">
                  qator {r.excelRow}
                  {r.name ? ` — ${r.name}` : ""}
                </p>
                <ul className="mt-1 space-y-0.5 text-destructive/90">
                  {r.errors.map((e, i) => (
                    <li key={i}>• {e}</li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function SummaryChip({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "success" | "error";
}) {
  const styles =
    tone === "success"
      ? "ring-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
      : tone === "error"
        ? "ring-destructive/30 bg-destructive/5 text-destructive"
        : "ring-foreground/10 bg-muted/40 text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 ring-1 ${styles}`}
    >
      <span className="font-medium tabular-nums">{value}</span>
      <span>{label}</span>
    </span>
  );
}
```

- [ ] **Step 2: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/topics/topic-import-dialog.tsx
git commit -m "feat(admin): topic import dialog (3-stage modal)"
```

---

## Task 10: Mount the dialog from the topics tree

**Files:**
- Modify: `src/app/admin/topics/topics-tree.tsx`

- [ ] **Step 1: Add the import + state**

In `src/app/admin/topics/topics-tree.tsx`:

Find the existing lucide-react import block:

```tsx
import {
  ChevronDown,
  ChevronRight,
  FolderTree,
  Plus,
  Pencil,
  Minus,
} from "lucide-react";
```

Replace with (add `Upload`):

```tsx
import {
  ChevronDown,
  ChevronRight,
  FolderTree,
  Plus,
  Pencil,
  Minus,
  Upload,
} from "lucide-react";
```

Find the existing TopicEditDialog import:

```tsx
import { TopicEditDialog, type TopicShape } from "./topic-edit-dialog";
```

Add a new line directly after it:

```tsx
import { TopicImportDialog } from "./topic-import-dialog";
```

Inside the `TopicsTree` function body, find:

```tsx
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
```

Add directly after it:

```tsx
  const [importOpen, setImportOpen] = useState(false);
```

- [ ] **Step 2: Add the button to the action row**

Locate the toolbar block that ends with `<Button size="sm" onClick={() => setEditingId("new")}>...</Button>`. Add an `XLSX import` button immediately before it:

Find:

```tsx
          <Button size="sm" onClick={() => setEditingId("new")}>
            <Plus data-icon="inline-start" />
            Yangi mavzu
          </Button>
```

Replace with:

```tsx
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
          >
            <Upload data-icon="inline-start" />
            XLSX import
          </Button>
          <Button size="sm" onClick={() => setEditingId("new")}>
            <Plus data-icon="inline-start" />
            Yangi mavzu
          </Button>
```

- [ ] **Step 3: Render the dialog**

Find the existing `TopicEditDialog` render at the end of the returned JSX:

```tsx
      {editingId !== null && (
        <TopicEditDialog
          mode={editingId === "new" ? "create" : "edit"}
          topic={editingTopic as TopicShape | undefined}
          allTopics={topics}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
```

Insert the import dialog before the closing `</div>`:

```tsx
      {editingId !== null && (
        <TopicEditDialog
          mode={editingId === "new" ? "create" : "edit"}
          topic={editingTopic as TopicShape | undefined}
          allTopics={topics}
          onClose={() => setEditingId(null)}
        />
      )}

      <TopicImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
```

- [ ] **Step 4: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/topics/topics-tree.tsx
git commit -m "feat(admin): wire XLSX import button + dialog into topics tree"
```

---

## Task 11: Manual UI verification + production build

**Files:** none modified

This task confirms the feature works end-to-end in a real browser before declaring it done.

- [ ] **Step 1: Run the full smoke suite**

Run:

```bash
bash scripts/run-all-smokes.sh
```

Expected: final line reads `Smoke suite: N passed, 0 failed`. If anything fails, fix it before moving on — do not skip.

- [ ] **Step 2: Run lint + production build**

Run:

```bash
npm run lint && npm run build
```

Expected: lint reports no errors; build completes with no TypeScript errors. (The build runs migrations too — make sure `DATABASE_URL` points at a dev-safe DB.)

- [ ] **Step 3: Start the dev server**

In one terminal:

```bash
npm run dev
```

- [ ] **Step 4: Walk through the golden path in the browser**

Open `http://localhost:3000/admin/topics`. Sign in as admin if prompted.

1. Click `XLSX import`. Modal opens.
2. Click `Namuna XLSX yuklab olish`. A file `mavzular-namuna.xlsx` downloads. Open it — three columns present, two example rows.
3. Edit the template: change `parent_id` of row 2 to an actual topic code from your local DB (visible in the topic table). Save. Pick the file in the modal.
4. Click `Tekshirish`. After a beat, validation summary shows `Jami: 2 To'g'ri: 2`. `Importni boshlash` button appears.
5. Click `Importni boshlash` → `Ha, qo'shamiz` in the confirm dialog.
6. Success modal opens listing two new `T######` codes. Close it.
7. The topics tree is refreshed — the new topics appear under the chosen parent and as a new root.

Expected: every step succeeds. New topics persist on page reload.

- [ ] **Step 5: Walk through an error path**

Build a second XLSX that violates two rules (e.g., empty `name` on one row, `parent_id=T999999` on another) and upload it.

Expected: modal shows summary chips with `Xato: 2`, lists both rows with their Excel row numbers and error messages, and the `Importni boshlash` button is hidden. The DB is unchanged (verify by checking topic count before/after).

- [ ] **Step 6: Confirm cleanup**

If you created throwaway topics during testing, delete them via the UI. Stop the dev server (`Ctrl+C`).

- [ ] **Step 7: Final commit if any small fixes landed**

If steps 4–5 surfaced anything to fix, commit those changes. If not, nothing to commit here.

---

## Recap

After Task 11 the feature ships: admins can download a template, upload a populated XLSX, see a per-row report, and bulk-insert topics — with every error handled either as a bundle stop or a row-level message, and the whole batch committed atomically.
