# Leaf-only Rule + Filter Expansion + Code URLs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A problem can only sit on a leaf topic/source; the filter expands a parent selection to all descendants; and the /admin/problems URL uses `T######` / `S######` / `A######` codes throughout — no JS-side conversion to UUIDs.

**Architecture:** One pure helper module (`hierarchy.ts`) backs three call-sites: the form/edit pickers (leaf-only mode), the import validator (reject parent codes), and the listing query (descendants expansion). The filter pipeline carries codes from URL through the listing SQL, where the only `code → id` resolution happens via an `inArray(table.code, codes)` subquery. The bulk-edit modal is unaffected — it still works in UUIDs since the mutations it calls need UUIDs.

**Tech Stack:** Next.js 16, React 19, Drizzle ORM, postgres-js, exceljs (already installed), zod.

**Spec:** [2026-05-17-leaf-only-and-code-urls-design.md](../specs/2026-05-17-leaf-only-and-code-urls-design.md)

**Codebase conventions you must follow:**
- No unit tests. Verification = `scripts/*-smoke.ts` scripts that print `Smoke: PASSED` on success. Register new smokes in `scripts/run-all-smokes.sh` under the `SERVER_ONLY` group (they import `server-only` modules).
- Smoke scripts run with `NODE_OPTIONS="--conditions=react-server"` to bypass the `server-only` throw.
- Server-only modules begin with `import "server-only";`.
- Drizzle `db` shared at `@/db`; schema re-exported from `@/db/schema`.
- UI text is Uzbek (Latin script). Match existing tone.
- `T######` regex lives in `src/lib/taxonomy/topic-codes.ts` as `TOPIC_CODE_REGEX`; source equivalent at `src/lib/taxonomy/source-codes.ts` as `SOURCE_CODE_REGEX`; age category at `src/lib/taxonomy/age-category-codes.ts` as `AGE_CATEGORY_CODE_REGEX`.

---

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `src/lib/taxonomy/hierarchy.ts` | Pure helpers: `parentIdSet`, `isLeaf`, `withDescendants`. Used by mutations, validator, listing query. |
| `scripts/leaf-rule-smoke.ts` | Smoke: helper sanity checks, mutation guards reject parents, `listProblems` expands a parent selection. |

**Modified files:**

| Path | Change |
|---|---|
| `src/lib/problems/mutations.ts` | `createProblemTx`, `updateProblemTx`, `bulkUpdateProblemsTx` reject parent source/topic ids. |
| `src/lib/import/validate.ts` | Per-problem error when a frontmatter code resolves to a parent node. |
| `src/lib/problems/queries.ts` | `listProblems` filter shape switches to codes; descendants are expanded inside the SQL via the hierarchy helper. |
| `src/components/problem-form-pickers/topic-tree-picker.tsx` | Parent rows disabled (no click, tooltip, muted style); stale parent ids filtered from displayed badges. |
| `src/components/problem-form-pickers/source-picker.tsx` | Same treatment for parent rows. |
| `src/app/admin/problems/filters.tsx` | `FilterPopover` gains `mode: "filter" \| "leaf-only"` prop. `ProblemsFilterBar` keeps filter state in codes and feeds a code-keyed view of dictionaries. |
| `src/app/admin/problems/bulk-edit-dialog.tsx` | Source and topic popovers pass `mode="leaf-only"`. |
| `src/app/admin/problems/_url-state.ts` | Field rename: `sourceCodes`, `ageCategoryCodes`, `topicCodes`. |
| `src/app/admin/problems/page.tsx` | Pass code arrays straight to `listProblems`. |
| `scripts/run-all-smokes.sh` | Register `leaf-rule-smoke.ts` in `SERVER_ONLY`. |

---

## Task 1: Create the hierarchy helper module

**Files:**
- Create: `src/lib/taxonomy/hierarchy.ts`

- [ ] **Step 1: Create the file**

Create `src/lib/taxonomy/hierarchy.ts`:

```ts
/**
 * Pure tree helpers shared by mutation guards, import validation, and
 * the filter expansion in listProblems. No React, no DB — feed it the
 * `(id, parentId)` rows you already have in scope and it answers the
 * three questions we ask everywhere:
 *
 *  - Which ids have a child? (parentIdSet)
 *  - Is this specific id a leaf? (isLeaf)
 *  - What's the full subtree under these ancestors? (withDescendants)
 */

export interface NodeRef {
  id: string;
  parentId: string | null;
}

/**
 * Return every id that appears as someone else's parentId — i.e. the
 * non-leaf set. Built once per caller and reused with O(1) lookups.
 */
export function parentIdSet(nodes: Iterable<NodeRef>): Set<string> {
  const parents = new Set<string>();
  for (const n of nodes) {
    if (n.parentId) parents.add(n.parentId);
  }
  return parents;
}

/** Convenience wrapper — true if `id` has no children in the given set. */
export function isLeaf(id: string, parents: Set<string>): boolean {
  return !parents.has(id);
}

/**
 * Expand a list of ancestor ids into the full set of ids in their
 * subtrees, *including the ancestors themselves*. Ids in `ancestorIds`
 * that don't appear in `nodes` are still returned (so an unknown id
 * doesn't silently disappear from the caller's filter).
 *
 * Result is in insertion order (BFS-ish, but order isn't guaranteed —
 * callers use this for `IN (...)` clauses where order doesn't matter).
 */
export function withDescendants(
  ancestorIds: Iterable<string>,
  nodes: Iterable<NodeRef>
): string[] {
  // Build children-of map once.
  const childrenOf = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.parentId) {
      const arr = childrenOf.get(n.parentId) ?? [];
      arr.push(n.id);
      childrenOf.set(n.parentId, arr);
    }
  }

  const out = new Set<string>();
  const queue: string[] = [];
  for (const id of ancestorIds) {
    if (!out.has(id)) {
      out.add(id);
      queue.push(id);
    }
  }
  while (queue.length > 0) {
    const next = queue.shift()!;
    const kids = childrenOf.get(next);
    if (!kids) continue;
    for (const child of kids) {
      if (!out.has(child)) {
        out.add(child);
        queue.push(child);
      }
    }
  }
  return Array.from(out);
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
git add src/lib/taxonomy/hierarchy.ts
git commit -m "feat(taxonomy): hierarchy helpers — parentIdSet, isLeaf, withDescendants"
```

---

## Task 2: Smoke-test the hierarchy helpers

**Files:**
- Create: `scripts/leaf-rule-smoke.ts`

This script will grow over the next tasks — Task 2 establishes its skeleton and the helper sanity checks. Later tasks (4, 6) extend it. We register it in `run-all-smokes.sh` now so the registration only happens once.

- [ ] **Step 1: Create the smoke script**

Create `scripts/leaf-rule-smoke.ts`:

```ts
// Smoke for the leaf-only rule, the filter descendants expansion, and
// the helper module. Runs against the local DB but isolates fixtures
// under a per-run code suffix so cleanup is safe.
//
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/leaf-rule-smoke.ts

import "../src/db/load-env";

import {
  parentIdSet,
  isLeaf,
  withDescendants,
} from "../src/lib/taxonomy/hierarchy";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

async function helperSanity() {
  //   1
  //  / \
  // 2   3
  //     |
  //     4
  const nodes = [
    { id: "1", parentId: null },
    { id: "2", parentId: "1" },
    { id: "3", parentId: "1" },
    { id: "4", parentId: "3" },
  ];

  const parents = parentIdSet(nodes);
  assert(parents.has("1"), "1 is a parent");
  assert(parents.has("3"), "3 is a parent");
  assert(!parents.has("2"), "2 is a leaf");
  assert(!parents.has("4"), "4 is a leaf");

  assert(!isLeaf("1", parents), "isLeaf(1) false");
  assert(isLeaf("2", parents), "isLeaf(2) true");
  assert(isLeaf("4", parents), "isLeaf(4) true");

  const sub = withDescendants(["1"], nodes).sort();
  assert(
    JSON.stringify(sub) === JSON.stringify(["1", "2", "3", "4"]),
    `withDescendants(1) = ${JSON.stringify(sub)}`
  );

  const sub3 = withDescendants(["3"], nodes).sort();
  assert(
    JSON.stringify(sub3) === JSON.stringify(["3", "4"]),
    `withDescendants(3) = ${JSON.stringify(sub3)}`
  );

  // Unknown id is preserved (no silent disappearance).
  const subUnknown = withDescendants(["99"], nodes);
  assert(
    JSON.stringify(subUnknown) === JSON.stringify(["99"]),
    `withDescendants(unknown) = ${JSON.stringify(subUnknown)}`
  );

  console.log("[1] hierarchy helpers ok");
}

async function main() {
  await helperSanity();
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

- [ ] **Step 2: Register in run-all-smokes.sh**

Read `scripts/run-all-smokes.sh` to confirm the `SERVER_ONLY` array. Add `"leaf-rule-smoke.ts"` to the array (preserve existing entries). The block becomes:

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
  "leaf-rule-smoke.ts"
)
```

- [ ] **Step 3: Run the smoke**

Run:

```bash
NODE_OPTIONS="--conditions=react-server" npx tsx scripts/leaf-rule-smoke.ts
```

Expected:

```
[1] hierarchy helpers ok
Smoke: PASSED
```

- [ ] **Step 4: Commit**

```bash
git add scripts/leaf-rule-smoke.ts scripts/run-all-smokes.sh
git commit -m "test: smoke for hierarchy helpers"
```

---

## Task 3: Mutation guards reject parents

**Files:**
- Modify: `src/lib/problems/mutations.ts`

- [ ] **Step 1: Read the file to see current imports + mutation shapes**

Read `src/lib/problems/mutations.ts` and note: imports already include `inArray` and `sql`; `ProblemInput` exists; `createProblemTx`, `updateProblemTx`, `bulkUpdateProblemsTx` each receive a transaction `tx`.

- [ ] **Step 2: Add imports**

Find the import block at the top:

```ts
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  problems,
  problemTopics,
  problemAgeCategories,
  images,
} from "@/db/schema";
import { formatProblemCode, parseProblemCodeSeq } from "./codes";
```

Add `topics` and `sources` to the `@/db/schema` import and add the hierarchy import directly after:

```ts
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  problems,
  problemTopics,
  problemAgeCategories,
  images,
  topics,
  sources,
} from "@/db/schema";
import { formatProblemCode, parseProblemCodeSeq } from "./codes";
import { parentIdSet } from "@/lib/taxonomy/hierarchy";
```

- [ ] **Step 3: Add a shared guard helper**

Directly after the imports and before `ProblemImageInput`, add:

```ts
/**
 * Throw if any of the given ids is a parent in its taxonomy. Run
 * inside every problem-write mutation so a tampered or stale client
 * can't sneak a problem onto a parent node.
 *
 * Reads only the columns we need from both taxonomies; one query each.
 */
async function assertLeavesOnly(
  tx: Pick<typeof db, "select">,
  sourceIds: string[],
  topicIds: string[]
): Promise<void> {
  if (sourceIds.length > 0) {
    const allSources = await tx
      .select({ id: sources.id, parentId: sources.parentId })
      .from(sources);
    const sourceParents = parentIdSet(allSources);
    const badSource = sourceIds.find((id) => sourceParents.has(id));
    if (badSource) {
      throw new Error(
        `Parent guruh manbaga masala biriktirib bo'lmaydi (${badSource})`
      );
    }
  }
  if (topicIds.length > 0) {
    const allTopics = await tx
      .select({ id: topics.id, parentId: topics.parentId })
      .from(topics);
    const topicParents = parentIdSet(allTopics);
    const badTopic = topicIds.find((id) => topicParents.has(id));
    if (badTopic) {
      throw new Error(
        `Parent guruh mavzuga masala biriktirib bo'lmaydi (${badTopic})`
      );
    }
  }
}
```

- [ ] **Step 4: Call the guard inside createProblemTx**

Find the start of `createProblemTx`:

```ts
export async function createProblemTx(input: ProblemInput, createdBy: string) {
  return db.transaction(async (tx) => {
    // Compute next code from the current max. Pulling just max() keeps
    // this O(1) instead of fetching every code.
    const [{ maxCode }] = await tx
```

Insert the guard call as the first statement inside the transaction:

```ts
export async function createProblemTx(input: ProblemInput, createdBy: string) {
  return db.transaction(async (tx) => {
    await assertLeavesOnly(tx, [input.sourceId], input.topicIds);
    // Compute next code from the current max. Pulling just max() keeps
    // this O(1) instead of fetching every code.
    const [{ maxCode }] = await tx
```

- [ ] **Step 5: Call the guard inside updateProblemTx**

Find `updateProblemTx`:

```ts
export async function updateProblemTx(
  id: string,
  input: ProblemInput
): Promise<{ orphanStorageKeys: string[] }> {
  return db.transaction(async (tx) => {
```

Insert the guard call as the first statement inside the transaction:

```ts
export async function updateProblemTx(
  id: string,
  input: ProblemInput
): Promise<{ orphanStorageKeys: string[] }> {
  return db.transaction(async (tx) => {
    await assertLeavesOnly(tx, [input.sourceId], input.topicIds);
```

- [ ] **Step 6: Call the guard inside bulkUpdateProblemsTx**

Find `bulkUpdateProblemsTx`'s transaction body opener:

```ts
  await db.transaction(async (tx) => {
    if (touchSource) {
      await tx
        .update(problems)
        .set({ sourceId: input.sourceId!, updatedAt: new Date() })
        .where(inArray(problems.id, input.ids));
    } else if (touchAges || touchTopics) {
```

Insert the guard as the first statement of the transaction:

```ts
  await db.transaction(async (tx) => {
    await assertLeavesOnly(
      tx,
      touchSource ? [input.sourceId!] : [],
      touchTopics ? input.topicIds! : []
    );
    if (touchSource) {
      await tx
        .update(problems)
        .set({ sourceId: input.sourceId!, updatedAt: new Date() })
        .where(inArray(problems.id, input.ids));
    } else if (touchAges || touchTopics) {
```

- [ ] **Step 7: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors. If TypeScript complains that `Pick<typeof db, "select">` doesn't accept a transaction handle, replace the parameter type with `{ select: typeof db.select }`. If that also fails, the existing pattern in the file uses `tx: typeof db` indirectly — fall back to typing the parameter as `Parameters<Parameters<typeof db.transaction>[0]>[0]` (Drizzle's transaction handle). Report what worked.

- [ ] **Step 8: Commit**

```bash
git add src/lib/problems/mutations.ts
git commit -m "feat(problems): mutations refuse parent topic/source ids"
```

---

## Task 4: Smoke-test the mutation guards

**Files:**
- Modify: `scripts/leaf-rule-smoke.ts`

- [ ] **Step 1: Extend the smoke script**

In `scripts/leaf-rule-smoke.ts`, add new imports near the top (after the `hierarchy` import):

```ts
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import {
  users,
  topics,
  sources,
  ageCategories,
  problems,
} from "../src/db/schema";
import {
  createProblemTx,
  updateProblemTx,
  bulkUpdateProblemsTx,
} from "../src/lib/problems/mutations";
import {
  createTopic,
  deleteTopic,
  createSource,
  deleteSource,
} from "../src/lib/taxonomy/mutations";
```

Then add a new section at the end of the script, before the `main()` function. The new section creates a parent topic + a leaf child topic + a parent source + a leaf child source, then asserts that `createProblemTx`, `updateProblemTx`, and `bulkUpdateProblemsTx` all reject any payload that targets the parent:

```ts
const SUFFIX = `leaf-${Date.now()}`;

async function mutationGuards() {
  // Fixtures: a parent and a leaf in both taxonomies.
  const parentTopicId = await createTopic({
    name: `Parent ${SUFFIX}`,
    parentId: null,
    description: null,
  });
  const leafTopicId = await createTopic({
    name: `Leaf ${SUFFIX}`,
    parentId: parentTopicId,
    description: null,
  });
  const parentSourceId = await createSource({
    name: `Parent src ${SUFFIX}`,
    parentId: null,
    logoStorageKey: null,
  });
  const leafSourceId = await createSource({
    name: `Leaf src ${SUFFIX}`,
    parentId: parentSourceId,
    logoStorageKey: null,
  });

  // Need an admin user for createdBy and an age category for the FK.
  const admin = (await db.query.users.findMany()).find(
    (u) => u.email === "admin@example.com"
  );
  assert(admin, "admin user missing — seed required");
  const [age] = await db
    .select({ id: ageCategories.id })
    .from(ageCategories)
    .limit(1);
  assert(age, "age category missing — seed required");

  // Helper: expect a thrown error whose message matches /Parent guruh/.
  async function expectParentRejection(
    fn: () => Promise<unknown>,
    label: string
  ) {
    let err: unknown = null;
    try {
      await fn();
    } catch (e) {
      err = e;
    }
    assert(err instanceof Error, `${label}: expected an error`);
    assert(
      /Parent guruh/.test((err as Error).message),
      `${label}: expected Parent-guruh error, got "${(err as Error).message}"`
    );
  }

  // create — parent source
  await expectParentRejection(
    () =>
      createProblemTx(
        {
          bodyMd: "Smoke",
          sourceId: parentSourceId,
          topicIds: [leafTopicId],
          ageCategoryIds: [age.id],
          image: null,
        },
        admin!.id
      ),
    "create with parent source"
  );

  // create — parent topic
  await expectParentRejection(
    () =>
      createProblemTx(
        {
          bodyMd: "Smoke",
          sourceId: leafSourceId,
          topicIds: [parentTopicId],
          ageCategoryIds: [age.id],
          image: null,
        },
        admin!.id
      ),
    "create with parent topic"
  );

  // Build a real (leaf-only) problem so update + bulkUpdate have a target.
  const okId = await createProblemTx(
    {
      bodyMd: "Smoke OK",
      sourceId: leafSourceId,
      topicIds: [leafTopicId],
      ageCategoryIds: [age.id],
      image: null,
    },
    admin!.id
  );

  // update — parent source
  await expectParentRejection(
    () =>
      updateProblemTx(okId, {
        bodyMd: "Smoke OK",
        sourceId: parentSourceId,
        topicIds: [leafTopicId],
        ageCategoryIds: [age.id],
        image: null,
      }),
    "update with parent source"
  );

  // bulkUpdate — parent topic
  await expectParentRejection(
    () =>
      bulkUpdateProblemsTx({
        ids: [okId],
        topicIds: [parentTopicId],
      }),
    "bulkUpdate with parent topic"
  );

  // Cleanup fixtures.
  await db.delete(problems).where(eq(problems.id, okId));
  await deleteTopic(leafTopicId);
  await deleteTopic(parentTopicId);
  await deleteSource(leafSourceId);
  await deleteSource(parentSourceId);

  console.log("[2] mutation guards reject parents ok");
}
```

Then update `main()` to call the new section:

```ts
async function main() {
  await helperSanity();
  await mutationGuards();
  console.log("Smoke: PASSED");
}
```

- [ ] **Step 2: Run the smoke**

Run:

```bash
NODE_OPTIONS="--conditions=react-server" npx tsx scripts/leaf-rule-smoke.ts
```

Expected:

```
[1] hierarchy helpers ok
[2] mutation guards reject parents ok
Smoke: PASSED
```

If you see an error about an unused import, remove the offending import. Drizzle / TS strictness may also surface complaints — fix at the import or call site.

- [ ] **Step 3: Commit**

```bash
git add scripts/leaf-rule-smoke.ts
git commit -m "test(leaf-rule): smoke for mutation guards"
```

---

## Task 5: Import validator rejects parent codes

**Files:**
- Modify: `src/lib/import/validate.ts`

- [ ] **Step 1: Read the file**

Read `src/lib/import/validate.ts` to confirm the current shape. Note: it already reads `id, code` for sources and topics; we extend those reads to include `parentId`.

- [ ] **Step 2: Add the hierarchy import**

Find the existing imports:

```ts
import "server-only";

import { db } from "@/db";
import { sources, topics, ageCategories } from "@/db/schema";
import { BUNDLE_LIMITS, problemFrontmatterSchema, type ProblemFrontmatter } from "./schema";
import type { ParsedBundle, ParsedProblem } from "./parse";
```

Add the hierarchy import:

```ts
import "server-only";

import { db } from "@/db";
import { sources, topics, ageCategories } from "@/db/schema";
import { BUNDLE_LIMITS, problemFrontmatterSchema, type ProblemFrontmatter } from "./schema";
import { parentIdSet } from "@/lib/taxonomy/hierarchy";
import type { ParsedBundle, ParsedProblem } from "./parse";
```

- [ ] **Step 3: Extend the dictionary reads**

Find the parallel select block in `validateBundle`:

```ts
  const [allSources, allTopics, allAgeCategories] = await Promise.all([
    db.select({ id: sources.id, code: sources.code }).from(sources),
    db.select({ id: topics.id, code: topics.code }).from(topics),
    db
      .select({ id: ageCategories.id, code: ageCategories.code })
      .from(ageCategories),
  ]);
  const sourceIdByCode = new Map(allSources.map((r) => [r.code, r.id]));
  const topicIdByCode = new Map(allTopics.map((r) => [r.code, r.id]));
  const ageCategoryIdByCode = new Map(
    allAgeCategories.map((r) => [r.code, r.id])
  );
```

Replace with:

```ts
  const [allSources, allTopics, allAgeCategories] = await Promise.all([
    db
      .select({
        id: sources.id,
        code: sources.code,
        parentId: sources.parentId,
      })
      .from(sources),
    db
      .select({
        id: topics.id,
        code: topics.code,
        parentId: topics.parentId,
      })
      .from(topics),
    db
      .select({ id: ageCategories.id, code: ageCategories.code })
      .from(ageCategories),
  ]);
  const sourceIdByCode = new Map(allSources.map((r) => [r.code, r.id]));
  const topicIdByCode = new Map(allTopics.map((r) => [r.code, r.id]));
  const ageCategoryIdByCode = new Map(
    allAgeCategories.map((r) => [r.code, r.id])
  );
  const sourceParents = parentIdSet(allSources);
  const topicParents = parentIdSet(allTopics);
```

- [ ] **Step 4: Pass the parent sets into validateProblem**

Find the call site:

```ts
  const result: ProblemValidation[] = bundle.problems.map((p) =>
    validateProblem(p, sourceIdByCode, ageCategoryIdByCode, topicIdByCode, imageNames)
  );
```

Replace with:

```ts
  const result: ProblemValidation[] = bundle.problems.map((p) =>
    validateProblem(
      p,
      sourceIdByCode,
      ageCategoryIdByCode,
      topicIdByCode,
      sourceParents,
      topicParents,
      imageNames
    )
  );
```

- [ ] **Step 5: Update validateProblem signature and body**

Find the `validateProblem` function. Replace its parameter list and the source/topic resolution block:

```ts
function validateProblem(
  parsed: ParsedProblem,
  sourceIdByCode: Map<string, string>,
  ageCategoryIdByCode: Map<string, string>,
  topicIdByCode: Map<string, string>,
  imageNames: Set<string>
): ProblemValidation {
```

becomes

```ts
function validateProblem(
  parsed: ParsedProblem,
  sourceIdByCode: Map<string, string>,
  ageCategoryIdByCode: Map<string, string>,
  topicIdByCode: Map<string, string>,
  sourceParents: Set<string>,
  topicParents: Set<string>,
  imageNames: Set<string>
): ProblemValidation {
```

And later in the same function, find:

```ts
  // 4. Resolve codes to UUIDs.
  const sourceId = sourceIdByCode.get(fm.source);
  if (!sourceId) {
    errors.push(`Manba topilmadi: ${fm.source}`);
  }

  const ageCategoryIds: string[] = [];
  for (const code of fm.age_categories) {
    const id = ageCategoryIdByCode.get(code);
    if (id) ageCategoryIds.push(id);
    else errors.push(`Yosh toifasi topilmadi: ${code}`);
  }

  const topicIds: string[] = [];
  for (const code of fm.topics) {
    const id = topicIdByCode.get(code);
    if (id) topicIds.push(id);
    else errors.push(`Mavzu topilmadi: ${code}`);
  }
```

Replace with:

```ts
  // 4. Resolve codes to UUIDs, then reject any parent (non-leaf) target.
  const sourceId = sourceIdByCode.get(fm.source);
  if (!sourceId) {
    errors.push(`Manba topilmadi: ${fm.source}`);
  } else if (sourceParents.has(sourceId)) {
    errors.push(
      `Manba parent guruh: ${fm.source} (faqat ichki manba tanlanadi)`
    );
  }

  const ageCategoryIds: string[] = [];
  for (const code of fm.age_categories) {
    const id = ageCategoryIdByCode.get(code);
    if (id) ageCategoryIds.push(id);
    else errors.push(`Yosh toifasi topilmadi: ${code}`);
  }

  const topicIds: string[] = [];
  for (const code of fm.topics) {
    const id = topicIdByCode.get(code);
    if (!id) {
      errors.push(`Mavzu topilmadi: ${code}`);
      continue;
    }
    if (topicParents.has(id)) {
      errors.push(
        `Mavzu parent guruh: ${code} (faqat ichki mavzu tanlanadi)`
      );
      continue;
    }
    topicIds.push(id);
  }
```

- [ ] **Step 6: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Run the existing import-failure smoke**

The pre-existing `import-failure-smoke.ts` exercises the validator. Run it to confirm we haven't regressed the existing error paths:

```bash
NODE_OPTIONS="--conditions=react-server" npx tsx scripts/import-failure-smoke.ts
```

Expected: it prints assertions ok and `Import-failure smoke: PASSED` (or similar). If it fails because of an env issue unrelated to validator changes (e.g. missing seed), note the failure and proceed — we have the leaf-rule smoke to verify the new rule.

- [ ] **Step 8: Commit**

```bash
git add src/lib/import/validate.ts
git commit -m "feat(import): reject parent topic/source codes per problem"
```

---

## Task 6: listProblems accepts codes and expands descendants

**Files:**
- Modify: `src/lib/problems/queries.ts`

- [ ] **Step 1: Update the filter type**

Find `ProblemListFilters`:

```ts
export interface ProblemListFilters {
  search?: string;
  sourceIds?: string[];
  ageCategoryIds?: string[];
  topicIds?: string[];
}
```

(If the exact field name differs, search for `interface ProblemListFilters` in `src/lib/problems/queries.ts` and adapt the replacement.) Replace with:

```ts
export interface ProblemListFilters {
  search?: string;
  /** S###### codes; filter expands to descendants when a parent code is given. */
  sourceCodes?: string[];
  /** A###### codes. Age categories are flat — no expansion. */
  ageCategoryCodes?: string[];
  /** T###### codes; filter expands to descendants when a parent code is given. */
  topicCodes?: string[];
}
```

- [ ] **Step 2: Replace the filter-building block in listProblems**

Find the existing filter conditions block in `listProblems`:

```ts
  if (filters.sourceIds?.length) {
    conds.push(inArray(problems.sourceId, filters.sourceIds));
  }
  if (filters.ageCategoryIds?.length) {
    conds.push(
      exists(
        db
          .select({ one: sql<number>`1` })
          .from(problemAgeCategories)
          .where(
            and(
              eq(problemAgeCategories.problemId, problems.id),
              inArray(
                problemAgeCategories.ageCategoryId,
                filters.ageCategoryIds
              )
            )
          )
      )
    );
  }
  if (filters.topicIds?.length) {
    conds.push(
      exists(
        db
          .select({ one: sql<number>`1` })
          .from(problemTopics)
          .where(
            and(
              eq(problemTopics.problemId, problems.id),
              inArray(problemTopics.topicId, filters.topicIds)
            )
          )
      )
    );
  }
```

Replace with:

```ts
  // Source filter — expand to descendants on the SQL side. We need
  // (id, parentId) for the topology and (code, id) for the resolution,
  // so a single read with all three columns covers both.
  if (filters.sourceCodes?.length) {
    const allSources = await db
      .select({
        id: sources.id,
        code: sources.code,
        parentId: sources.parentId,
      })
      .from(sources);
    const idByCode = new Map(allSources.map((s) => [s.code, s.id]));
    const seedIds = filters.sourceCodes
      .map((c) => idByCode.get(c))
      .filter((id): id is string => id != null);
    if (seedIds.length > 0) {
      const expanded = withDescendants(seedIds, allSources);
      conds.push(inArray(problems.sourceId, expanded));
    }
  }

  // Age category filter — flat, no expansion. Translate code -> id with
  // a subquery so codes flow straight through.
  if (filters.ageCategoryCodes?.length) {
    conds.push(
      exists(
        db
          .select({ one: sql<number>`1` })
          .from(problemAgeCategories)
          .innerJoin(
            ageCategories,
            eq(ageCategories.id, problemAgeCategories.ageCategoryId)
          )
          .where(
            and(
              eq(problemAgeCategories.problemId, problems.id),
              inArray(ageCategories.code, filters.ageCategoryCodes)
            )
          )
      )
    );
  }

  // Topic filter — expand to descendants like sources do.
  if (filters.topicCodes?.length) {
    const allTopics = await db
      .select({
        id: topics.id,
        code: topics.code,
        parentId: topics.parentId,
      })
      .from(topics);
    const idByCode = new Map(allTopics.map((t) => [t.code, t.id]));
    const seedIds = filters.topicCodes
      .map((c) => idByCode.get(c))
      .filter((id): id is string => id != null);
    if (seedIds.length > 0) {
      const expanded = withDescendants(seedIds, allTopics);
      conds.push(
        exists(
          db
            .select({ one: sql<number>`1` })
            .from(problemTopics)
            .where(
              and(
                eq(problemTopics.problemId, problems.id),
                inArray(problemTopics.topicId, expanded)
              )
            )
        )
      );
    }
  }
```

- [ ] **Step 3: Add the hierarchy import**

Find the import block at the top of `src/lib/problems/queries.ts`. Add `withDescendants`:

```ts
import { withDescendants } from "@/lib/taxonomy/hierarchy";
```

Place it after the `db/schema` re-export import block (preserve existing import ordering).

- [ ] **Step 4: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: errors will appear in `_url-state.ts` and `page.tsx` because they still reference the renamed fields. **That's expected** — Tasks 7 and 8 fix those.

Verify the errors are confined to those two files. If errors appear in `queries.ts` itself, fix them. If errors appear elsewhere, stop and report.

- [ ] **Step 5: Commit**

```bash
git add src/lib/problems/queries.ts
git commit -m "feat(problems): listProblems accepts codes and expands parent filters to descendants"
```

---

## Task 7: URL state uses codes

**Files:**
- Modify: `src/app/admin/problems/_url-state.ts`

- [ ] **Step 1: Update the parser**

Replace the entire body of `parseSearchParams` so the returned filters carry codes:

```ts
export function parseSearchParams(sp: URLSearchParams): {
  filters: ProblemListFilters;
  sort: ProblemListSort;
  page: number;
  pageSize: number;
} {
  const filters: ProblemListFilters = {
    search: sp.get("q") ?? undefined,
    sourceCodes: csv(sp.get("source")),
    ageCategoryCodes: csv(sp.get("ageCategory")),
    topicCodes: csv(sp.get("topic")),
  };

  const sortField = sp.get("sortField");
  const sortDir = sp.get("sortDir");
  const sort: ProblemListSort = {
    field: sortField === "code" ? "code" : "createdAt",
    direction: sortDir === "asc" ? "asc" : "desc",
  };

  const page = Math.max(1, parseInt1(sp.get("page")) ?? 1);

  return { filters, sort, page, pageSize: PAGE_SIZE };
}
```

The URL query parameter names (`source`, `ageCategory`, `topic`) stay the same — only their *interpretation* changes (codes, not UUIDs).

- [ ] **Step 2: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: `_url-state.ts` no longer errors. `page.tsx` still errors — Task 8 fixes that.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/problems/_url-state.ts
git commit -m "feat(problems-url): codes instead of UUIDs"
```

---

## Task 8: page.tsx passes codes straight to listProblems

**Files:**
- Modify: `src/app/admin/problems/page.tsx`

- [ ] **Step 1: Read the file**

Read `src/app/admin/problems/page.tsx`. No structural change is needed — `parseSearchParams(usp)` already returns the right shape after Task 7; we just need to confirm the rest of the file still compiles.

- [ ] **Step 2: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: errors point at `filters.tsx` consumers that still call `setCsv("source", sourceIds)` etc. (`ProblemsFilterBar`). Those are Task 10. If errors appear in `page.tsx` itself (e.g. the destructure broke because of a different field rename), fix here; otherwise leave them for Task 10.

- [ ] **Step 3: No commit yet**

Nothing to commit in this task — the file already does what we need now that `parseSearchParams` returns codes. Move on. (The "task" exists so the plan reader sees we considered this file.)

---

## Task 9: Picker UI — disable parent rows in form pickers

**Files:**
- Modify: `src/components/problem-form-pickers/topic-tree-picker.tsx`
- Modify: `src/components/problem-form-pickers/source-picker.tsx`

- [ ] **Step 1: TopicTreePicker — compute the parent set and pass it down**

In `src/components/problem-form-pickers/topic-tree-picker.tsx`:

Add the hierarchy import near the top imports:

```ts
import { parentIdSet } from "@/lib/taxonomy/hierarchy";
```

Find the body of `TopicTreePicker` right after `const tree = useMemo(...)`:

```ts
  const tree = useMemo(() => buildTopicTree(available), [available]);

  // Collapsed set — start with all parents collapsed.
```

Add a `parentSet` memo and a sanitized `value` (filter out parents that may be in stale form state):

```ts
  const tree = useMemo(() => buildTopicTree(available), [available]);

  // Parents (have children) can't hold a problem — render them
  // disabled and silently filter them out of `value` so stale drafts
  // don't keep the user stuck on a forbidden id.
  const parentSet = useMemo(
    () =>
      parentIdSet(
        available.map((t) => ({ id: t.id, parentId: t.parentId }))
      ),
    [available]
  );

  // Collapsed set — start with all parents collapsed.
```

Find the line:

```ts
  const selected = available.filter((t) => value.includes(t.id));
```

Replace with (also filters out any parent id from the visible badges):

```ts
  const selected = available.filter(
    (t) => value.includes(t.id) && !parentSet.has(t.id)
  );
```

- [ ] **Step 2: TopicTreePicker — pass parentSet to TreeRows and block clicks**

Find the `<TreeRows ... />` call in the popover JSX:

```ts
              <TreeRows
                nodes={tree}
                depth={0}
                collapsed={collapsed}
                expandedExtra={visible.expandedExtra}
                allow={visible.allow}
                selectedIds={value}
                onToggleCollapse={toggleCollapse}
                onToggleSelect={toggleSelect}
              />
```

Add the `parentSet` prop:

```ts
              <TreeRows
                nodes={tree}
                depth={0}
                collapsed={collapsed}
                expandedExtra={visible.expandedExtra}
                allow={visible.allow}
                selectedIds={value}
                parentSet={parentSet}
                onToggleCollapse={toggleCollapse}
                onToggleSelect={toggleSelect}
              />
```

Find the `TreeRows` function declaration and props type:

```ts
function TreeRows({
  nodes,
  depth,
  collapsed,
  expandedExtra,
  allow,
  selectedIds,
  onToggleCollapse,
  onToggleSelect,
}: {
  nodes: TopicTreeNode<Topic>[];
  depth: number;
  collapsed: Set<string>;
  /** Ancestor IDs that should be temporarily expanded because of a search match. */
  expandedExtra: Set<string>;
  /** When set, only nodes whose IDs are in this set may render. */
  allow: Set<string> | null;
  selectedIds: string[];
  onToggleCollapse: (id: string) => void;
  onToggleSelect: (id: string) => void;
}): React.ReactNode {
```

Replace with (add `parentSet` prop, plumb it through the recursion):

```ts
function TreeRows({
  nodes,
  depth,
  collapsed,
  expandedExtra,
  allow,
  selectedIds,
  parentSet,
  onToggleCollapse,
  onToggleSelect,
}: {
  nodes: TopicTreeNode<Topic>[];
  depth: number;
  collapsed: Set<string>;
  /** Ancestor IDs that should be temporarily expanded because of a search match. */
  expandedExtra: Set<string>;
  /** When set, only nodes whose IDs are in this set may render. */
  allow: Set<string> | null;
  selectedIds: string[];
  /** Parents — render disabled and ignore clicks on their row body. */
  parentSet: Set<string>;
  onToggleCollapse: (id: string) => void;
  onToggleSelect: (id: string) => void;
}): React.ReactNode {
```

Then find the row-body div inside the same function:

```ts
            <div
              className={cn(
                "group flex items-center gap-1.5 px-2 py-1.5 text-sm cursor-pointer rounded-sm",
                "hover:bg-muted transition-colors",
                isSelected && "bg-[var(--accent-brand)]/5"
              )}
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
              onClick={() => onToggleSelect(node.topic.id)}
            >
```

Replace with (disable click when parent, change cursor + tone, add tooltip + aria-disabled):

```ts
            <div
              className={cn(
                "group flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-sm transition-colors",
                parentSet.has(node.topic.id)
                  ? "cursor-default text-muted-foreground"
                  : "cursor-pointer hover:bg-muted",
                isSelected && "bg-[var(--accent-brand)]/5"
              )}
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
              aria-disabled={parentSet.has(node.topic.id) || undefined}
              title={
                parentSet.has(node.topic.id)
                  ? "Faqat ichki mavzu tanlanadi — bu guruh"
                  : undefined
              }
              onClick={() => {
                if (parentSet.has(node.topic.id)) return;
                onToggleSelect(node.topic.id);
              }}
            >
```

Find the recursive call within the same function:

```ts
            {hasChildren && !isCollapsed && (
              <TreeRows
                nodes={node.children}
                depth={depth + 1}
                collapsed={collapsed}
                expandedExtra={expandedExtra}
                allow={allow}
                selectedIds={selectedIds}
                onToggleCollapse={onToggleCollapse}
                onToggleSelect={onToggleSelect}
              />
            )}
```

Replace to pass `parentSet` through:

```ts
            {hasChildren && !isCollapsed && (
              <TreeRows
                nodes={node.children}
                depth={depth + 1}
                collapsed={collapsed}
                expandedExtra={expandedExtra}
                allow={allow}
                selectedIds={selectedIds}
                parentSet={parentSet}
                onToggleCollapse={onToggleCollapse}
                onToggleSelect={onToggleSelect}
              />
            )}
```

- [ ] **Step 3: SourcePicker — refuse parent picks**

In `src/components/problem-form-pickers/source-picker.tsx`:

Add the hierarchy import near the top imports:

```ts
import { parentIdSet } from "@/lib/taxonomy/hierarchy";
```

Find the `pick` function and the row-body button. The current `pick` runs `onChange(id); setOpen(false);` — if a parent id leaks through we want it to be a no-op. Find:

```ts
  function pick(id: string) {
    onChange(id);
    setOpen(false);
    // Defer cleanup so the close animation doesn't flicker.
    setTimeout(() => {
      setQuery("");
    }, 150);
  }
```

Right above it (still inside `SourcePicker`), add:

```ts
  const parentSet = useMemo(
    () =>
      parentIdSet(
        available.map((s) => ({ id: s.id, parentId: s.parentId }))
      ),
    [available]
  );
```

Then update `pick` to refuse parents:

```ts
  function pick(id: string) {
    if (parentSet.has(id)) return;
    onChange(id);
    setOpen(false);
    // Defer cleanup so the close animation doesn't flicker.
    setTimeout(() => {
      setQuery("");
    }, 150);
  }
```

Find the row-body button in the popover (around the `pick(node.id)` call):

```ts
                  {/* Row body — picks this source */}
                  <button
                    type="button"
                    onClick={() => pick(node.id)}
                    className="flex-1 min-w-0 flex items-center gap-2 py-1.5 text-left"
```

Replace with (add disabled state, mute style, title):

```ts
                  {/* Row body — picks this source */}
                  <button
                    type="button"
                    onClick={() => pick(node.id)}
                    disabled={parentSet.has(node.id)}
                    title={
                      parentSet.has(node.id)
                        ? "Faqat ichki manba tanlanadi — bu guruh"
                        : undefined
                    }
                    className={cn(
                      "flex-1 min-w-0 flex items-center gap-2 py-1.5 text-left",
                      parentSet.has(node.id) &&
                        "cursor-default text-muted-foreground"
                    )}
```

(The `cn` import is already in the file.)

Also handle the case where the externally provided `value` is a parent — render the trigger as "no selection" so the user isn't shown a forbidden pick. Find:

```ts
  const selected = value ? (byId.get(value) ?? null) : null;
```

Replace with:

```ts
  const selected =
    value && byId.get(value) && !parentSet.has(value)
      ? byId.get(value)!
      : null;
```

- [ ] **Step 4: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: pickers compile clean. Errors elsewhere (filters.tsx etc.) may persist — those are addressed in Task 10.

- [ ] **Step 5: Commit**

```bash
git add src/components/problem-form-pickers/topic-tree-picker.tsx src/components/problem-form-pickers/source-picker.tsx
git commit -m "feat(pickers): parents are disabled and not selectable in form pickers"
```

---

## Task 10: ProblemsFilterBar — codes end-to-end, FilterPopover gains `mode`

**Files:**
- Modify: `src/app/admin/problems/filters.tsx`

- [ ] **Step 1: Read the file**

Open `src/app/admin/problems/filters.tsx`. The two functions of interest are `FilterPopover` (the generic picker) and `ProblemsFilterBar` (the surface that reads URL params and renders the popovers).

- [ ] **Step 2: Add `mode` prop to FilterPopover**

Find the function signature:

```ts
export function FilterPopover({
  label,
  icon,
  count,
  options,
  selected,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  count: number;
  options: FilterOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
```

Replace with:

```ts
export function FilterPopover({
  label,
  icon,
  count,
  options,
  selected,
  onChange,
  mode = "filter",
}: {
  label: string;
  icon: React.ReactNode;
  count: number;
  options: FilterOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  /**
   * `"filter"` (default) lets parents be picked — the listing query
   * expands them to descendants on the server. `"leaf-only"` is used
   * by the bulk-edit dialog: parent rows render as disabled and click
   * is a no-op, so admins can't bulk-assign problems to a parent.
   */
  mode?: "filter" | "leaf-only";
}) {
```

- [ ] **Step 3: Disable parent clicks in leaf-only mode**

Find the row-button inside `FilterPopover` that toggles selection:

```ts
                  {/* Row body — toggles selection */}
                  <button
                    type="button"
                    onClick={() => toggleSelect(o.id)}
                    className="flex-1 min-w-0 flex items-center gap-2 py-1.5 text-left"
                  >
```

Replace with:

```ts
                  {/* Row body — toggles selection. In leaf-only mode
                      parents (rows with hasChildren) are disabled and
                      the click is a no-op. */}
                  <button
                    type="button"
                    onClick={() => {
                      if (mode === "leaf-only" && o.hasChildren) return;
                      toggleSelect(o.id);
                    }}
                    disabled={mode === "leaf-only" && o.hasChildren}
                    title={
                      mode === "leaf-only" && o.hasChildren
                        ? "Faqat ichki turkum tanlanadi — bu guruh"
                        : undefined
                    }
                    className={cn(
                      "flex-1 min-w-0 flex items-center gap-2 py-1.5 text-left",
                      mode === "leaf-only" &&
                        o.hasChildren &&
                        "cursor-default text-muted-foreground"
                    )}
                  >
```

- [ ] **Step 4: Switch ProblemsFilterBar to codes**

Find the start of `ProblemsFilterBar`:

```ts
export function ProblemsFilterBar({
  sourcesAvailable,
  ageCategoriesAvailable,
  topicsAvailable,
  sort,
}: {
  sourcesAvailable: FilterOption[];
  ageCategoriesAvailable: FilterOption[];
  topicsAvailable: FilterOption[];
  sort: ProblemListSort;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const search = params.get("q") ?? "";
  const sourceIds = csv(params.get("source"));
  const ageCategoryIds = csv(params.get("ageCategory"));
  const topicIds = csv(params.get("topic"));

  const activeFilterCount =
    (search ? 1 : 0) +
    sourceIds.length +
    ageCategoryIds.length +
    topicIds.length;

  const sourceById = useMemo(
    () => new Map(sourcesAvailable.map((s) => [s.id, s])),
    [sourcesAvailable]
  );
  const ageById = useMemo(
    () => new Map(ageCategoriesAvailable.map((c) => [c.id, c])),
    [ageCategoriesAvailable]
  );
  const topicById = useMemo(
    () => new Map(topicsAvailable.map((t) => [t.id, t])),
    [topicsAvailable]
  );
```

Replace the body up through the lookup maps with (rename `*Ids` → `*Codes`, build code-keyed views + code-keyed lookup maps):

```ts
export function ProblemsFilterBar({
  sourcesAvailable,
  ageCategoriesAvailable,
  topicsAvailable,
  sort,
}: {
  sourcesAvailable: FilterOption[];
  ageCategoriesAvailable: FilterOption[];
  topicsAvailable: FilterOption[];
  sort: ProblemListSort;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const search = params.get("q") ?? "";
  // The filter pipeline carries codes from URL → state → popover →
  // back to URL. No UUID lives anywhere here.
  const sourceCodes = csv(params.get("source"));
  const ageCategoryCodes = csv(params.get("ageCategory"));
  const topicCodes = csv(params.get("topic"));

  const activeFilterCount =
    (search ? 1 : 0) +
    sourceCodes.length +
    ageCategoryCodes.length +
    topicCodes.length;

  // Code-keyed views of the dictionaries. The FilterPopover keys
  // everything by `option.id`; in this view, that id IS the code,
  // and `parentId` is the parent's code. This is the *only* place
  // we materialise codes — the rest of the bar just passes them.
  const sourceOptionsByCode = useMemo<FilterOption[]>(() => {
    const idToCode = new Map(sourcesAvailable.map((s) => [s.id, s.code]));
    return sourcesAvailable.map((s) => ({
      id: s.code,
      code: s.code,
      name: s.name,
      parentId: s.parentId ? (idToCode.get(s.parentId) ?? null) : null,
    }));
  }, [sourcesAvailable]);
  const ageOptionsByCode = useMemo<FilterOption[]>(
    () =>
      ageCategoriesAvailable.map((c) => ({
        id: c.code,
        code: c.code,
        name: c.name,
        parentId: null,
      })),
    [ageCategoriesAvailable]
  );
  const topicOptionsByCode = useMemo<FilterOption[]>(() => {
    const idToCode = new Map(topicsAvailable.map((t) => [t.id, t.code]));
    return topicsAvailable.map((t) => ({
      id: t.code,
      code: t.code,
      name: t.name,
      parentId: t.parentId ? (idToCode.get(t.parentId) ?? null) : null,
    }));
  }, [topicsAvailable]);

  const sourceByCode = useMemo(
    () => new Map(sourcesAvailable.map((s) => [s.code, s])),
    [sourcesAvailable]
  );
  const ageByCode = useMemo(
    () => new Map(ageCategoriesAvailable.map((c) => [c.code, c])),
    [ageCategoriesAvailable]
  );
  const topicByCode = useMemo(
    () => new Map(topicsAvailable.map((t) => [t.code, t])),
    [topicsAvailable]
  );
```

- [ ] **Step 5: Update FilterPopover usages and the active-chip rows**

Find the three `<FilterPopover ... />` calls inside `ProblemsFilterBar`:

```ts
        <FilterPopover
          label="Manba"
          icon={<Library className="size-3.5" aria-hidden />}
          count={sourceIds.length}
          options={sourcesAvailable}
          selected={sourceIds}
          onChange={(ids) => setCsv("source", ids)}
        />
        <FilterPopover
          label="Yosh toifasi"
          icon={<Hash className="size-3.5" aria-hidden />}
          count={ageCategoryIds.length}
          options={ageCategoriesAvailable}
          selected={ageCategoryIds}
          onChange={(ids) => setCsv("ageCategory", ids)}
        />
        <FilterPopover
          label="Mavzular"
          icon={<Tags className="size-3.5" aria-hidden />}
          count={topicIds.length}
          options={topicsAvailable}
          selected={topicIds}
          onChange={(ids) => setCsv("topic", ids)}
        />
```

Replace with (code-keyed views + renamed state):

```ts
        <FilterPopover
          label="Manba"
          icon={<Library className="size-3.5" aria-hidden />}
          count={sourceCodes.length}
          options={sourceOptionsByCode}
          selected={sourceCodes}
          onChange={(codes) => setCsv("source", codes)}
        />
        <FilterPopover
          label="Yosh toifasi"
          icon={<Hash className="size-3.5" aria-hidden />}
          count={ageCategoryCodes.length}
          options={ageOptionsByCode}
          selected={ageCategoryCodes}
          onChange={(codes) => setCsv("ageCategory", codes)}
        />
        <FilterPopover
          label="Mavzular"
          icon={<Tags className="size-3.5" aria-hidden />}
          count={topicCodes.length}
          options={topicOptionsByCode}
          selected={topicCodes}
          onChange={(codes) => setCsv("topic", codes)}
        />
```

Find the active-chip rendering — currently keyed by `sourceById.get(id)` etc.:

```ts
          {sourceIds.map((id) => {
            const s = sourceById.get(id);
            if (!s) return null;
            return (
              <ActiveChip
                key={`s-${id}`}
                label={s.name}
                kind="Manba"
                onRemove={() =>
                  setCsv("source", sourceIds.filter((x) => x !== id))
                }
              />
            );
          })}
          {ageCategoryIds.map((id) => {
            const c = ageById.get(id);
            if (!c) return null;
            return (
              <ActiveChip
                key={`a-${id}`}
                label={c.name}
                kind="Yosh"
                onRemove={() =>
                  setCsv(
                    "ageCategory",
                    ageCategoryIds.filter((x) => x !== id)
                  )
                }
              />
            );
          })}
          {topicIds.map((id) => {
            const t = topicById.get(id);
            if (!t) return null;
            return (
              <ActiveChip
                key={`t-${id}`}
                label={t.name}
                kind="Mavzu"
                onRemove={() =>
                  setCsv("topic", topicIds.filter((x) => x !== id))
                }
              />
            );
          })}
```

Replace with (codes throughout):

```ts
          {sourceCodes.map((code) => {
            const s = sourceByCode.get(code);
            if (!s) return null;
            return (
              <ActiveChip
                key={`s-${code}`}
                label={s.name}
                kind="Manba"
                onRemove={() =>
                  setCsv(
                    "source",
                    sourceCodes.filter((x) => x !== code)
                  )
                }
              />
            );
          })}
          {ageCategoryCodes.map((code) => {
            const c = ageByCode.get(code);
            if (!c) return null;
            return (
              <ActiveChip
                key={`a-${code}`}
                label={c.name}
                kind="Yosh"
                onRemove={() =>
                  setCsv(
                    "ageCategory",
                    ageCategoryCodes.filter((x) => x !== code)
                  )
                }
              />
            );
          })}
          {topicCodes.map((code) => {
            const t = topicByCode.get(code);
            if (!t) return null;
            return (
              <ActiveChip
                key={`t-${code}`}
                label={t.name}
                kind="Mavzu"
                onRemove={() =>
                  setCsv("topic", topicCodes.filter((x) => x !== code))
                }
              />
            );
          })}
```

- [ ] **Step 6: Type-check + build**

Run:

```bash
npx tsc --noEmit
```

Expected: errors should now be limited to `bulk-edit-dialog.tsx` (it references the un-passed `mode` prop indirectly — verify). If `page.tsx` still complains, double-check Tasks 7/8.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/problems/filters.tsx
git commit -m "feat(filters): carry codes end-to-end; FilterPopover gains mode prop"
```

---

## Task 11: BulkEditDialog uses leaf-only mode

**Files:**
- Modify: `src/app/admin/problems/bulk-edit-dialog.tsx`

- [ ] **Step 1: Pass mode="leaf-only" to the source and topic popovers**

In `src/app/admin/problems/bulk-edit-dialog.tsx`, find the source `<FilterPopover ... />`:

```tsx
            <FilterPopover
              label="Tanlang"
              icon={<Library className="size-3.5" aria-hidden />}
              count={sourceId ? 1 : 0}
              options={sourcesAvailable}
              selected={sourceId ? [sourceId] : []}
              onChange={handleSourceChange}
            />
```

Add `mode="leaf-only"`:

```tsx
            <FilterPopover
              label="Tanlang"
              icon={<Library className="size-3.5" aria-hidden />}
              count={sourceId ? 1 : 0}
              options={sourcesAvailable}
              selected={sourceId ? [sourceId] : []}
              onChange={handleSourceChange}
              mode="leaf-only"
            />
```

Find the topic `<FilterPopover ... />`:

```tsx
            <FilterPopover
              label="Tanlang"
              icon={<Tags className="size-3.5" aria-hidden />}
              count={topicIds.length}
              options={topicsAvailable}
              selected={topicIds}
              onChange={setTopicIds}
            />
```

Add `mode="leaf-only"`:

```tsx
            <FilterPopover
              label="Tanlang"
              icon={<Tags className="size-3.5" aria-hidden />}
              count={topicIds.length}
              options={topicsAvailable}
              selected={topicIds}
              onChange={setTopicIds}
              mode="leaf-only"
            />
```

(The age-category popover doesn't need `mode` — age categories are flat, no parents.)

- [ ] **Step 2: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: zero errors. All renames + new shapes now align.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/problems/bulk-edit-dialog.tsx
git commit -m "feat(bulk-edit): source + topic popovers use leaf-only mode"
```

---

## Task 12: Smoke-test the listing expansion

**Files:**
- Modify: `scripts/leaf-rule-smoke.ts`

- [ ] **Step 1: Extend the smoke with a listing-expansion check**

In `scripts/leaf-rule-smoke.ts`, add an import for `listProblems`:

```ts
import { listProblems } from "../src/lib/problems/queries";
```

Then add a third async section before `main()`:

```ts
async function listingExpansion() {
  // Build a tiny taxonomy: parent topic with two leaf children, one
  // leaf source, one age category. Create a problem under each leaf
  // topic. Filter by the parent topic code; expect both problems.
  const parentTopicId = await createTopic({
    name: `Parent-list ${SUFFIX}`,
    parentId: null,
    description: null,
  });
  const leafATopicId = await createTopic({
    name: `Leaf-A ${SUFFIX}`,
    parentId: parentTopicId,
    description: null,
  });
  const leafBTopicId = await createTopic({
    name: `Leaf-B ${SUFFIX}`,
    parentId: parentTopicId,
    description: null,
  });
  const leafSourceId = await createSource({
    name: `Leaf-src ${SUFFIX}`,
    parentId: null,
    logoStorageKey: null,
  });

  const admin = (await db.query.users.findMany()).find(
    (u) => u.email === "admin@example.com"
  );
  assert(admin, "admin user missing");
  const [age] = await db
    .select({ id: ageCategories.id })
    .from(ageCategories)
    .limit(1);
  assert(age, "age category missing");

  const probAId = await createProblemTx(
    {
      bodyMd: `body-A ${SUFFIX}`,
      sourceId: leafSourceId,
      topicIds: [leafATopicId],
      ageCategoryIds: [age.id],
      image: null,
    },
    admin!.id
  );
  const probBId = await createProblemTx(
    {
      bodyMd: `body-B ${SUFFIX}`,
      sourceId: leafSourceId,
      topicIds: [leafBTopicId],
      ageCategoryIds: [age.id],
      image: null,
    },
    admin!.id
  );

  // Look up the parent topic's code so we filter by code (codes are the
  // public surface; we minted the ids above).
  const [parentRow] = await db
    .select({ code: topics.code })
    .from(topics)
    .where(eq(topics.id, parentTopicId));
  assert(parentRow, "parent topic row missing");

  const filtered = await listProblems(
    { topicCodes: [parentRow.code] },
    { field: "createdAt", direction: "desc" },
    1,
    100
  );
  const matchedIds = new Set(filtered.rows.map((r) => r.id));
  assert(
    matchedIds.has(probAId) && matchedIds.has(probBId),
    `listProblems(parent code) should match both leaves (got ids=${Array.from(
      matchedIds
    ).join(",")})`
  );

  // Filtering by a single leaf code matches only that leaf.
  const [leafARow] = await db
    .select({ code: topics.code })
    .from(topics)
    .where(eq(topics.id, leafATopicId));
  const filteredLeaf = await listProblems(
    { topicCodes: [leafARow.code] },
    { field: "createdAt", direction: "desc" },
    1,
    100
  );
  const leafMatchedIds = new Set(filteredLeaf.rows.map((r) => r.id));
  assert(
    leafMatchedIds.has(probAId) && !leafMatchedIds.has(probBId),
    `listProblems(leafA code) should match only A (got ids=${Array.from(
      leafMatchedIds
    ).join(",")})`
  );

  // Cleanup.
  await db.delete(problems).where(inArray(problems.id, [probAId, probBId]));
  await deleteTopic(leafATopicId);
  await deleteTopic(leafBTopicId);
  await deleteTopic(parentTopicId);
  await deleteSource(leafSourceId);

  console.log("[3] listProblems expands parent → descendants ok");
}
```

Update `main()`:

```ts
async function main() {
  await helperSanity();
  await mutationGuards();
  await listingExpansion();
  console.log("Smoke: PASSED");
}
```

- [ ] **Step 2: Run the smoke**

```bash
NODE_OPTIONS="--conditions=react-server" npx tsx scripts/leaf-rule-smoke.ts
```

Expected:

```
[1] hierarchy helpers ok
[2] mutation guards reject parents ok
[3] listProblems expands parent → descendants ok
Smoke: PASSED
```

- [ ] **Step 3: Commit**

```bash
git add scripts/leaf-rule-smoke.ts
git commit -m "test(leaf-rule): smoke for listProblems parent expansion"
```

---

## Task 13: Full smoke run + production build + manual UI check

**Files:** none modified.

- [ ] **Step 1: Run the full smoke suite**

```bash
bash scripts/run-all-smokes.sh
```

Expected: `leaf-rule-smoke.ts` and `taxonomy-smoke.ts` and `list-smoke.ts` and `topics-xlsx-smoke.ts` all PASS. Pre-existing env-dependent failures (r2-smoke, http page smokes) are noise — confirm none of the leaf-rule, list, taxonomy, or topics-xlsx smokes regressed.

- [ ] **Step 2: Lint + build**

```bash
npm run lint && npm run build
```

Expected: no new lint errors in files we touched; build completes with no TS errors. The two pre-existing `Date.now()` purity lint errors in `src/app/admin/page.tsx` are unrelated and predate this work.

- [ ] **Step 3: Manual UI verification**

Start the dev server (`npm run dev`) and walk through:

1. `/admin/problems/new` — open the topic picker. Confirm parents render greyed out with the title "Faqat ichki mavzu tanlanadi — bu guruh" on hover; clicking them does nothing; child rows still work. Same with the source picker.
2. Try to submit a problem with a parent (by tampering with form state via devtools or by selecting a leaf then renaming a parent to look like a leaf — optional). Confirm the action returns the friendly error.
3. `/admin/problems` — the filter URL now uses codes. Pick a parent topic; the URL shows `?topic=T######`; the list contains problems under all descendants. Reload the page; selection survives.
4. Select multiple problems → "O'zgartirish". In the modal, parents are greyed out in both the source and topic popovers.
5. Try importing a ZIP whose `topics:` frontmatter references a parent code. The validation report shows `Mavzu parent guruh: T###### (faqat ichki mavzu tanlanadi)`.

- [ ] **Step 4: Merge to main and push**

If everything looks good, fast-forward main and push (the user's standard deploy path):

```bash
git -C "D:/Projects/provia" merge --ff-only claude/sleepy-northcutt-f62136
git -C "D:/Projects/provia" push origin main
```

Vercel auto-deploys.

---

## Recap

After Task 13:
- A problem can only be assigned to a leaf topic/source. The rule is enforced in the UI pickers, server mutations, and the ZIP importer.
- Filtering by a parent topic or source in the listing matches every descendant — one server-side expansion, no UI change.
- The URL uses `T######` / `S######` / `A######` codes throughout. The filter pipeline never touches UUIDs; conversion lives in a single SQL subquery inside `listProblems`.
- `scripts/leaf-rule-smoke.ts` covers the helper, the mutation guards, and the listing expansion end-to-end.
