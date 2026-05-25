# Methods (yechish metodi) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new nested taxonomy `methods` (yechish metodi) to problems. Optional zero-or-more methods per problem on the create/edit form, **not** requested during bulk import, with its own `/admin/methods` CRUD surface mirroring `/admin/topics`.

**Architecture:**
- DB: parallel of `topics` — a `methods` table (id, code `M######`, name, parent_id, description) plus a `problem_methods` junction with `ON DELETE CASCADE` for problems and `ON DELETE RESTRICT` for methods.
- Backend: hydrate methods on problem reads; create/update/bulk-update accept `methodIds` as optional (empty array allowed).
- UI: `/admin/methods` mirrors `/admin/topics` exactly (tree, edit dialog, sidebar entry). Problem form gets a Methods picker shaped like Topics' picker but optional. Detail page renders methods as chips. List page filter bar adds a Methods popover.
- Import: untouched — methods are simply absent from frontmatter and default to `[]`.

**Tech Stack:** Next.js 16 (App Router), Drizzle ORM, PostgreSQL, react-hook-form + zod, Tailwind, lucide-react.

---

## File map

**Create:**
- `src/db/migrations/0017_methods.sql`
- `src/lib/taxonomy/method-codes.ts`
- `src/app/admin/methods/page.tsx`
- `src/app/admin/methods/_actions.ts`
- `src/app/admin/methods/methods-tree.tsx`
- `src/app/admin/methods/method-edit-dialog.tsx`
- `src/components/problem-form-pickers/method-tree-picker.tsx`

**Modify:**
- `src/db/schema/taxonomy.ts` — add `methods` table.
- `src/db/schema/problems.ts` — add `problemMethods` junction + types.
- `src/db/migrations/meta/_journal.json` — append entry for 0017.
- `src/lib/taxonomy/mutations.ts` — add `createMethod`, `updateMethod`, `deleteMethod`.
- `src/lib/taxonomy/queries.ts` — add `listMethodsWithCounts`, `MethodWithCount` type.
- `src/lib/problems/mutations.ts` — `ProblemInput.methodIds?`, persist + leaf-check methods in create/update/bulkUpdate.
- `src/lib/problems/queries.ts` — hydrate methods on `getProblemById/Code`; `methodCodes` filter in `listProblems`; `ProblemListMethod` row type.
- `src/app/admin/problems/_actions.ts` — extend `problemSchema` (optional methodIds) + `bulkUpdateSchema` (optional methodIds).
- `src/app/admin/problems/_url-state.ts` — parse `method` CSV.
- `src/app/admin/problems/page.tsx` — fetch methods dictionary; pass to filter bar + list.
- `src/app/admin/problems/filters.tsx` — add Methods popover + active chips + `clearAll`.
- `src/app/admin/problems/problems-list.tsx` — accept + forward `methodsAvailable` to `BulkEditDialog`.
- `src/app/admin/problems/bulk-edit-dialog.tsx` — add Methods field.
- `src/app/admin/problems/new/page.tsx` — fetch methods, pass to form.
- `src/app/admin/problems/[id]/page.tsx` — render method chips in sidebar.
- `src/app/admin/problems/[id]/edit/page.tsx` — pass methodIds defaults + methodsAvailable.
- `src/components/problem-form.tsx` — add `methodIds` to form schema + props.
- `src/components/metadata-form.tsx` — add Methods picker, optional field.
- `src/app/admin/sidebar-nav.tsx` — add Metodlar entry.

---

## Task 1: DB migration + schema + codes lib

**Files:**
- Create: `src/db/migrations/0017_methods.sql`
- Modify: `src/db/migrations/meta/_journal.json`
- Modify: `src/db/schema/taxonomy.ts`
- Modify: `src/db/schema/problems.ts`
- Create: `src/lib/taxonomy/method-codes.ts`

- [ ] **Step 1: Write the migration SQL**

Create `src/db/migrations/0017_methods.sql`:

```sql
-- Methods taxonomy (yechish metodi) — parallel of `topics`.
--
-- A problem can be solved with zero or more methods (induktsiya, qarama-qarshilik,
-- generating functions, …). Nested so admins can group families
-- ("Kombinatorika metodlari" → "Bijektsiya", "Inklyuziya–eksklyuziya").
--
-- Same shape and conventions as topics: stable `M######` code, name, optional
-- parent_id (ON DELETE SET NULL — parent removal orphans children, doesn't
-- cascade), optional description.
--
-- Junction `problem_methods` is ON DELETE CASCADE on the problem side
-- (problem deletion drops its method links) and ON DELETE RESTRICT on the
-- method side (deleting a method that's still in use fails — the action
-- layer surfaces it as a friendly error, same as topics).

CREATE TABLE "methods" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "parent_id" uuid REFERENCES "methods"("id") ON DELETE SET NULL,
  "description" text
);
CREATE INDEX "methods_code_idx" ON "methods" ("code");
CREATE INDEX "methods_parent_id_idx" ON "methods" ("parent_id");
CREATE INDEX "methods_name_lower_idx" ON "methods" (lower("name"));

CREATE TABLE "problem_methods" (
  "problem_id" uuid NOT NULL REFERENCES "problems"("id") ON DELETE CASCADE,
  "method_id" uuid NOT NULL REFERENCES "methods"("id") ON DELETE RESTRICT,
  PRIMARY KEY ("problem_id", "method_id")
);
CREATE INDEX "problem_methods_method_id_idx" ON "problem_methods" ("method_id");
```

- [ ] **Step 2: Append journal entry**

Open `src/db/migrations/meta/_journal.json` and append a new entry after the existing last entry (idx 16):

```json
    {
      "idx": 17,
      "version": "7",
      "when": 1779840000000,
      "tag": "0017_methods",
      "breakpoints": true
    }
```

Use a `when` strictly greater than the previous (16 = `1780099200000`). Use `1780185600000`. Make sure the `]` and `}` still close the file.

- [ ] **Step 3: Add `methods` table to schema/taxonomy.ts**

Add to `src/db/schema/taxonomy.ts` after the `topics` export (around line 40), before the `sources` export:

```ts
/**
 * Methods — `yechish metodi`. Parallel of `topics`: stable `M######` code,
 * display name, optional self-referencing parent for grouping. A problem
 * has zero or more methods (vs. topics which require ≥ 1); the metadata
 * is added later by the admin, not at import time.
 */
export const methods = pgTable(
  "methods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => methods.id, {
      onDelete: "set null",
    }),
    description: text("description"),
  },
  (t) => [
    index("methods_code_idx").on(t.code),
    index("methods_parent_id_idx").on(t.parentId),
    index("methods_name_lower_idx").on(sql`lower(${t.name})`),
  ]
);
```

And at the bottom of the file (where other types are exported, after `AgeCategory` types):

```ts
export type Method = typeof methods.$inferSelect;
export type NewMethod = typeof methods.$inferInsert;
```

- [ ] **Step 4: Add `problemMethods` junction to schema/problems.ts**

Open `src/db/schema/problems.ts`. Extend the import line that pulls from `./taxonomy` to also import `methods`:

```ts
import { sources, topics, ageCategories, methods } from "./taxonomy";
```

After the `problemAgeCategories` export (around line 114), add:

```ts
/**
 * Junction table linking problems to methods. Same shape and FK semantics
 * as `problemTopics`: `ON DELETE CASCADE` on the problem side so deleting
 * a problem drops its method links automatically; `ON DELETE RESTRICT` on
 * the method side so an admin can't delete a method that's still in use
 * (the action layer surfaces that as a friendly error).
 *
 * Methods are optional per problem — empty set is valid, unlike topics
 * which require ≥ 1.
 */
export const problemMethods = pgTable(
  "problem_methods",
  {
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    methodId: uuid("method_id")
      .notNull()
      .references(() => methods.id, { onDelete: "restrict" }),
  },
  (t) => [
    primaryKey({ columns: [t.problemId, t.methodId] }),
    index("problem_methods_method_id_idx").on(t.methodId),
  ]
);
```

At the bottom of the file (after `ProblemAgeCategory` type), add:

```ts
export type ProblemMethod = typeof problemMethods.$inferSelect;
```

- [ ] **Step 5: Create method-codes.ts**

Create `src/lib/taxonomy/method-codes.ts` — full copy of `topic-codes.ts` with `Topic` → `Method` and `T` → `M`:

```ts
/**
 * Method identifier conventions.
 *
 * Mirror of `topic-codes.ts` but for the `methods` taxonomy.
 * Two parallel identifiers, both human-facing:
 *
 *   code    →  `M000042`     stable, sequential, assigned at create time,
 *                            never reused or re-numbered.
 *
 *   path    →  `1.2.3`       computed from tree position. Changes when
 *                            siblings reorder. Display-only — don't store.
 *
 * The internal UUID `id` still drives joins; these two are for humans.
 */

import type { Method } from "@/db/schema";

export const METHOD_CODE_PREFIX = "M";
export const METHOD_CODE_PAD = 6;
export const METHOD_CODE_REGEX = /^M\d{6,}$/;

export function formatMethodCode(seq: number): string {
  return `${METHOD_CODE_PREFIX}${String(seq).padStart(METHOD_CODE_PAD, "0")}`;
}

export function parseMethodCodeSeq(code: string): number {
  if (!METHOD_CODE_REGEX.test(code)) return Number.NaN;
  return Number.parseInt(code.slice(METHOD_CODE_PREFIX.length), 10);
}

export function nextMethodCode(existingCodes: string[]): string {
  let max = 0;
  for (const code of existingCodes) {
    const n = parseMethodCodeSeq(code);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return formatMethodCode(max + 1);
}

// --- Hierarchy path -------------------------------------------------------

export interface MethodTreeNode<
  T extends Pick<Method, "id" | "parentId" | "code" | "name">,
> {
  method: T;
  /** Hierarchical position like "1.2.3" — empty string for orphans. */
  path: string;
  children: MethodTreeNode<T>[];
}

export function buildMethodTree<
  T extends Pick<Method, "id" | "parentId" | "code" | "name">,
>(methodsList: T[]): MethodTreeNode<T>[] {
  const byParent = new Map<string | null, T[]>();
  for (const m of methodsList) {
    const key = m.parentId ?? null;
    const arr = byParent.get(key) ?? [];
    arr.push(m);
    byParent.set(key, arr);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.code.localeCompare(b.code));
  }

  function build(
    parentId: string | null,
    parentPath: string
  ): MethodTreeNode<T>[] {
    const kids = byParent.get(parentId) ?? [];
    return kids.map((method, i) => {
      const path = parentPath ? `${parentPath}.${i + 1}` : String(i + 1);
      return {
        method,
        path,
        children: build(method.id, path),
      };
    });
  }

  return build(null, "");
}

export function flattenMethodTree<
  T extends Pick<Method, "id" | "parentId" | "code" | "name">,
>(
  roots: MethodTreeNode<T>[]
): Array<{ method: T; path: string; depth: number }> {
  const out: Array<{ method: T; path: string; depth: number }> = [];
  function walk(nodes: MethodTreeNode<T>[], depth: number) {
    for (const n of nodes) {
      out.push({ method: n.method, path: n.path, depth });
      walk(n.children, depth + 1);
    }
  }
  walk(roots, 0);
  return out;
}
```

- [ ] **Step 6: Run type-check + lint**

Run: `npx tsc --noEmit` — Expected: no output (no errors).
Run: `npx eslint src/db src/lib/taxonomy/method-codes.ts` — Expected: no output.

- [ ] **Step 7: Run the migration locally**

Run: `npm run db:migrate`
Expected: migration 0017_methods applies. Verify by inspecting the journal `applied` set (drizzle prints it) or via psql `\dt` showing `methods` and `problem_methods` tables.

If the dev DB is in a state where migrate fails, document the error in the task report and stop — do not improvise.

- [ ] **Step 8: Commit**

```bash
git add src/db/migrations/0017_methods.sql src/db/migrations/meta/_journal.json src/db/schema/taxonomy.ts src/db/schema/problems.ts src/lib/taxonomy/method-codes.ts
git commit -m "feat(methods): db migration + schema + code formatter"
```

---

## Task 2: Taxonomy backend (mutations + queries)

**Files:**
- Modify: `src/lib/taxonomy/mutations.ts`
- Modify: `src/lib/taxonomy/queries.ts`

- [ ] **Step 1: Add method CRUD to mutations.ts**

In `src/lib/taxonomy/mutations.ts`, extend the imports at the top:

```ts
import { topics, sources, ageCategories, methods } from "@/db/schema";
import { nextTopicCode } from "./topic-codes";
import { nextAgeCategoryCode } from "./age-category-codes";
import { nextSourceCode } from "./source-codes";
import { nextMethodCode } from "./method-codes";
```

After the age-categories block (after `deleteAgeCategory`, around line 173), append:

```ts
// --- Methods ----------------------------------------------------------------

export interface MethodInput {
  name: string;
  parentId: string | null;
  description: string | null;
}

export async function createMethod(input: MethodInput): Promise<string> {
  // Same `select max(code)` + sequential mint pattern as topics — UNIQUE
  // on `code` turns parallel-creator races into clean constraint errors.
  const [maxRow] = await db
    .select({ maxCode: sql<string | null>`max(${methods.code})` })
    .from(methods);
  const code = nextMethodCode(maxRow?.maxCode ? [maxRow.maxCode] : []);

  const [created] = await db
    .insert(methods)
    .values({ ...input, code })
    .returning({ id: methods.id });
  if (!created) throw new Error("Insert returned no rows");
  return created.id;
}

export async function updateMethod(
  id: string,
  input: MethodInput
): Promise<void> {
  await db.update(methods).set(input).where(eq(methods.id, id));
}

/**
 * Delete a method. Schema sets `methods.parentId` ON DELETE SET NULL so
 * children survive as roots; `problem_methods` is ON DELETE RESTRICT so
 * Postgres throws if any problem still uses it and the action layer
 * surfaces that as a friendly error (mirror of `deleteTopic`).
 */
export async function deleteMethod(id: string): Promise<void> {
  await db.delete(methods).where(eq(methods.id, id));
}
```

- [ ] **Step 2: Add listMethodsWithCounts to queries.ts**

Open `src/lib/taxonomy/queries.ts`. Extend the schema imports to include `methods` and `problemMethods`:

```ts
import {
  topics,
  sources,
  ageCategories,
  methods,
  problems,
  problemTopics,
  problemAgeCategories,
  problemMethods,
} from "@/db/schema";
```

After `listAgeCategoriesWithCounts` (around line 190), append:

```ts
export interface MethodWithCount {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  description: string | null;
  problemCount: number;
}

/**
 * Mirror of `listTopicsWithCounts`. Two parallel queries + JS merge so
 * we never rely on Drizzle's outer-scope column resolution inside a
 * correlated subquery (see the long comment on `listSourcesWithCounts`
 * for the historical reason).
 *
 * Counts are rolled up the tree so a parent method shows the sum of
 * problems sitting under its descendants — same convention as topics.
 */
export async function listMethodsWithCounts(): Promise<MethodWithCount[]> {
  const [rows, directCounts] = await Promise.all([
    db
      .select({
        id: methods.id,
        code: methods.code,
        name: methods.name,
        parentId: methods.parentId,
        description: methods.description,
      })
      .from(methods)
      .orderBy(methods.code),
    db
      .select({
        methodId: problemMethods.methodId,
        count: sql<number>`count(*)::int`,
      })
      .from(problemMethods)
      .groupBy(problemMethods.methodId),
  ]);

  const directByMethodId = new Map(
    directCounts.map((r) => [r.methodId, r.count])
  );
  const rowsWithDirect = rows.map((r) => ({
    ...r,
    problemCount: directByMethodId.get(r.id) ?? 0,
  }));

  const rollup = rollupCounts(rowsWithDirect);
  return rowsWithDirect.map((r) => ({
    ...r,
    problemCount: rollup.get(r.id) ?? 0,
  }));
}
```

- [ ] **Step 3: Run type-check + lint**

Run: `npx tsc --noEmit` — Expected: no output.
Run: `npx eslint src/lib/taxonomy` — Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/lib/taxonomy/mutations.ts src/lib/taxonomy/queries.ts
git commit -m "feat(methods): taxonomy mutations + listMethodsWithCounts"
```

---

## Task 3: Problem mutations + action schema + problem queries

**Files:**
- Modify: `src/lib/problems/mutations.ts`
- Modify: `src/lib/problems/queries.ts`
- Modify: `src/app/admin/problems/_actions.ts`

- [ ] **Step 1: Extend ProblemInput + persist methods in problem mutations**

In `src/lib/problems/mutations.ts`:

Extend the schema imports to include `methods` and `problemMethods`:

```ts
import {
  problems,
  problemTopics,
  problemAgeCategories,
  problemMethods,
  images,
  topics,
  sources,
  methods,
} from "@/db/schema";
```

Replace the `assertLeavesOnly` function with this version that also validates methods (kept optional so existing callers passing only `topicIds` keep working):

```ts
async function assertLeavesOnly(
  tx: Pick<typeof db, "select">,
  sourceIds: string[],
  topicIds: string[],
  methodIds: string[] = []
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
  if (methodIds.length > 0) {
    const allMethods = await tx
      .select({ id: methods.id, parentId: methods.parentId })
      .from(methods);
    const methodParents = parentIdSet(allMethods);
    const badMethod = methodIds.find((id) => methodParents.has(id));
    if (badMethod) {
      throw new Error(
        `Parent guruh metodga masala biriktirib bo'lmaydi (${badMethod})`
      );
    }
  }
}
```

Extend `ProblemInput`:

```ts
export interface ProblemInput {
  bodyMd: string;
  sourceId: string;
  topicIds: string[];
  ageCategoryIds: string[];
  /** Optional — methods can be zero-or-more per problem (unlike topics). */
  methodIds?: string[];
  image?: ProblemImageInput | null;
  metadata?: Record<string, unknown>;
}
```

In `createProblemTx`, after the `assertLeavesOnly` call, change it to pass `methodIds`:

```ts
await assertLeavesOnly(
  tx,
  [input.sourceId],
  input.topicIds,
  input.methodIds ?? []
);
```

After the `problemAgeCategories` insert block (before the `if (input.image)` block), add:

```ts
if (input.methodIds && input.methodIds.length > 0) {
  await tx.insert(problemMethods).values(
    input.methodIds.map((methodId) => ({
      problemId: created.id,
      methodId,
    }))
  );
}
```

In `updateProblemTx`, change the `assertLeavesOnly` call similarly:

```ts
await assertLeavesOnly(
  tx,
  [input.sourceId],
  input.topicIds,
  input.methodIds ?? []
);
```

After the existing delete of `problemAgeCategories` (around line 173), add a delete for methods (wholesale replace, same as topics/age categories):

```ts
await tx
  .delete(problemMethods)
  .where(eq(problemMethods.problemId, id));
```

After the `problemAgeCategories` insert block (before `await tx.delete(images)...` — re-check line numbers — actually images delete already ran; method insert goes after the age-category insert and before `if (input.image)`):

```ts
if (input.methodIds && input.methodIds.length > 0) {
  await tx.insert(problemMethods).values(
    input.methodIds.map((methodId) => ({ problemId: id, methodId }))
  );
}
```

Extend `BulkUpdateProblemsInput`:

```ts
export interface BulkUpdateProblemsInput {
  ids: string[];
  sourceId?: string;
  ageCategoryIds?: string[];
  topicIds?: string[];
  /** Replace semantics like topics. Undefined = don't touch; empty array = clear. */
  methodIds?: string[];
}
```

In `bulkUpdateProblemsTx`, add a `touchMethods` boolean alongside the existing ones, include it in the early-exit check and `updatedAt` bump, and replace the assertLeavesOnly call to forward methods:

```ts
const touchSource = input.sourceId !== undefined;
const touchAges = input.ageCategoryIds !== undefined;
const touchTopics = input.topicIds !== undefined;
const touchMethods = input.methodIds !== undefined;
if (!touchSource && !touchAges && !touchTopics && !touchMethods) return;

await db.transaction(async (tx) => {
  await assertLeavesOnly(
    tx,
    touchSource ? [input.sourceId!] : [],
    touchTopics ? input.topicIds! : [],
    touchMethods ? input.methodIds! : []
  );
```

Change the `else if (touchAges || touchTopics)` branch to include methods:

```ts
} else if (touchAges || touchTopics || touchMethods) {
  await tx
    .update(problems)
    .set({ updatedAt: new Date() })
    .where(inArray(problems.id, input.ids));
}
```

After the `touchTopics` block at the end of the transaction body, add:

```ts
if (touchMethods) {
  await tx
    .delete(problemMethods)
    .where(inArray(problemMethods.problemId, input.ids));
  const rows = input.ids.flatMap((problemId) =>
    input.methodIds!.map((methodId) => ({ problemId, methodId }))
  );
  if (rows.length > 0) {
    await tx.insert(problemMethods).values(rows);
  }
}
```

- [ ] **Step 2: Hydrate methods + add methodCodes filter to problem queries**

In `src/lib/problems/queries.ts`, extend the schema imports:

```ts
import {
  problems,
  problemTopics,
  problemAgeCategories,
  problemMethods,
  images,
  topics,
  ageCategories,
  methods,
  sources,
} from "@/db/schema";
```

In `hydrateProblem`, extend the `Promise.all` to fetch methods:

```ts
const [topicRows, ageCategoryRows, methodRows, source, imageRows] =
  await Promise.all([
    db
      .select({ id: topics.id, code: topics.code, name: topics.name })
      .from(problemTopics)
      .innerJoin(topics, eq(topics.id, problemTopics.topicId))
      .where(eq(problemTopics.problemId, id)),
    db
      .select({
        id: ageCategories.id,
        code: ageCategories.code,
        name: ageCategories.name,
      })
      .from(problemAgeCategories)
      .innerJoin(
        ageCategories,
        eq(ageCategories.id, problemAgeCategories.ageCategoryId)
      )
      .where(eq(problemAgeCategories.problemId, id))
      .orderBy(ageCategories.code),
    db
      .select({ id: methods.id, code: methods.code, name: methods.name })
      .from(problemMethods)
      .innerJoin(methods, eq(methods.id, problemMethods.methodId))
      .where(eq(problemMethods.problemId, id))
      .orderBy(methods.code),
    db.query.sources.findFirst({ where: eq(sources.id, problem.sourceId) }),
    db.query.images.findMany({ where: eq(images.problemId, id) }),
  ]);

return {
  ...problem,
  topics: topicRows,
  ageCategories: ageCategoryRows,
  methods: methodRows,
  source,
  images: imageRows,
};
```

Extend `ProblemListFilters`:

```ts
export interface ProblemListFilters {
  search?: string;
  /** S###### codes; filter expands to descendants when a parent code is given. */
  sourceCodes?: string[];
  /** A###### codes. Age categories are flat — no expansion. */
  ageCategoryCodes?: string[];
  /** T###### codes; filter expands to descendants when a parent code is given. */
  topicCodes?: string[];
  /** M###### codes; filter expands to descendants when a parent code is given. */
  methodCodes?: string[];
}
```

Extend `ProblemListRow` and add `ProblemListMethod`:

```ts
export interface ProblemListMethod {
  id: string;
  code: string;
  name: string;
}

export interface ProblemListRow {
  id: string;
  code: string;
  bodyPreview: string;
  sourceCode: string | null;
  sourceName: string;
  createdAt: Date;
  topics: ProblemListTopic[];
  ageCategories: ProblemListAgeCategory[];
  methods: ProblemListMethod[];
}
```

In `listProblems`, after the `topicCodes` filter block (around line 238, before `const whereClause = conds.length ? and(...conds) : undefined;`), add a method filter mirroring topics:

```ts
// Method filter — same descendant expansion as topics.
if (filters.methodCodes?.length) {
  const allMethods = await db
    .select({
      id: methods.id,
      code: methods.code,
      parentId: methods.parentId,
    })
    .from(methods);
  const idByCode = new Map(allMethods.map((m) => [m.code, m.id]));
  const seedIds = filters.methodCodes
    .map((c) => idByCode.get(c))
    .filter((id): id is string => id != null);
  if (seedIds.length > 0) {
    const expanded = withDescendants(seedIds, allMethods);
    conds.push(
      exists(
        db
          .select({ one: sql<number>`1` })
          .from(problemMethods)
          .where(
            and(
              eq(problemMethods.problemId, problems.id),
              inArray(problemMethods.methodId, expanded)
            )
          )
      )
    );
  }
}
```

In the hydration tail of `listProblems` (after the `if (rows.length === 0) return ...` guard, where topics + age categories are hydrated), extend the `Promise.all` to also fetch methods, and the `rows.map` to include methods. Update the chunk that begins `const ids = rows.map(...)`:

```ts
const ids = rows.map((r) => r.id);
const [topicRows, ageCategoryRows, methodRows] = await Promise.all([
  db
    .select({
      problemId: problemTopics.problemId,
      id: topics.id,
      code: topics.code,
      name: topics.name,
    })
    .from(problemTopics)
    .innerJoin(topics, eq(topics.id, problemTopics.topicId))
    .where(inArray(problemTopics.problemId, ids)),
  db
    .select({
      problemId: problemAgeCategories.problemId,
      id: ageCategories.id,
      code: ageCategories.code,
      name: ageCategories.name,
    })
    .from(problemAgeCategories)
    .innerJoin(
      ageCategories,
      eq(ageCategories.id, problemAgeCategories.ageCategoryId)
    )
    .where(inArray(problemAgeCategories.problemId, ids)),
  db
    .select({
      problemId: problemMethods.problemId,
      id: methods.id,
      code: methods.code,
      name: methods.name,
    })
    .from(problemMethods)
    .innerJoin(methods, eq(methods.id, problemMethods.methodId))
    .where(inArray(problemMethods.problemId, ids)),
]);

const topicsByProblem = new Map<string, ProblemListTopic[]>();
for (const r of topicRows) {
  const arr = topicsByProblem.get(r.problemId) ?? [];
  arr.push({ id: r.id, code: r.code, name: r.name });
  topicsByProblem.set(r.problemId, arr);
}
const ageCategoriesByProblem = new Map<string, ProblemListAgeCategory[]>();
for (const r of ageCategoryRows) {
  const arr = ageCategoriesByProblem.get(r.problemId) ?? [];
  arr.push({ id: r.id, code: r.code, name: r.name });
  ageCategoriesByProblem.set(r.problemId, arr);
}
const methodsByProblem = new Map<string, ProblemListMethod[]>();
for (const r of methodRows) {
  const arr = methodsByProblem.get(r.problemId) ?? [];
  arr.push({ id: r.id, code: r.code, name: r.name });
  methodsByProblem.set(r.problemId, arr);
}

return {
  rows: rows.map((r) => ({
    id: r.id,
    code: r.code,
    bodyPreview: stripMarkdownToPreview(r.bodyMd, 140),
    sourceCode: r.sourceCode,
    sourceName: r.sourceName ?? "—",
    createdAt: r.createdAt,
    topics: topicsByProblem.get(r.id) ?? [],
    ageCategories: (ageCategoriesByProblem.get(r.id) ?? []).sort((a, b) =>
      a.code.localeCompare(b.code)
    ),
    methods: (methodsByProblem.get(r.id) ?? []).sort((a, b) =>
      a.code.localeCompare(b.code)
    ),
  })),
  total,
};
```

- [ ] **Step 3: Extend problemSchema + bulkUpdateSchema in _actions.ts**

In `src/app/admin/problems/_actions.ts`, extend `problemSchema`:

```ts
const problemSchema = z.object({
  bodyMd: z.string().min(1, "Problem body is required"),
  sourceId: z.string().uuid("Pick a source"),
  topicIds: z.array(z.string().uuid()).min(1, "Pick at least one topic"),
  ageCategoryIds: z
    .array(z.string().uuid())
    .min(1, "Kamida bitta yosh toifasini tanlang"),
  // Methods are optional (zero or more allowed). Default to [] so callers
  // that omit the key from the payload (e.g. older form revisions) keep
  // working without sending undefined into the mutation.
  methodIds: z.array(z.string().uuid()).optional().default([]),
  image: z
    .object({
      storageKey: z.string().min(1),
      publicUrl: z.string().url(),
      originalFilename: z.string(),
      sizeBytes: z.number().int().nonnegative(),
      mimeType: z.string().min(1),
    })
    .nullable()
    .default(null),
});
```

Extend `bulkUpdateSchema` to include methods (optional; min(0) so admin can explicitly clear methods on selected problems):

```ts
const bulkUpdateSchema = z
  .object({
    ids: z
      .array(z.string().uuid())
      .min(1)
      .max(
        BULK_OP_LIMIT,
        `Bir vaqtda ${BULK_OP_LIMIT} dan ortiq masalani o'zgartirib bo'lmaydi`
      ),
    sourceId: z.string().uuid().optional(),
    ageCategoryIds: z.array(z.string().uuid()).min(1).optional(),
    topicIds: z.array(z.string().uuid()).min(1).optional(),
    /** Methods can be cleared via bulk-edit — empty array means "no methods". */
    methodIds: z.array(z.string().uuid()).optional(),
  })
  .refine(
    (data) =>
      data.sourceId !== undefined ||
      data.ageCategoryIds !== undefined ||
      data.topicIds !== undefined ||
      data.methodIds !== undefined,
    { message: "Kamida bitta maydonni o'zgartiring" }
  );
```

- [ ] **Step 4: Run type-check + lint**

Run: `npx tsc --noEmit` — Expected: no output.
Run: `npx eslint src/lib/problems src/app/admin/problems/_actions.ts` — Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/lib/problems/mutations.ts src/lib/problems/queries.ts src/app/admin/problems/_actions.ts
git commit -m "feat(methods): wire problem mutations + queries + actions"
```

---

## Task 4: /admin/methods CRUD page + sidebar entry

**Files:**
- Create: `src/app/admin/methods/page.tsx`
- Create: `src/app/admin/methods/_actions.ts`
- Create: `src/app/admin/methods/methods-tree.tsx`
- Create: `src/app/admin/methods/method-edit-dialog.tsx`
- Modify: `src/app/admin/sidebar-nav.tsx`

- [ ] **Step 1: Create the actions file**

Create `src/app/admin/methods/_actions.ts` — full mirror of `src/app/admin/topics/_actions.ts` swapping topic → method:

```ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  createMethod,
  updateMethod,
  deleteMethod,
} from "@/lib/taxonomy/mutations";

const methodSchema = z.object({
  name: z.string().min(1).max(100),
  parentId: z.string().uuid().nullable(),
  description: z.string().max(1000).nullable(),
});

const idSchema = z.string().uuid();

export type ActionResult = { success: true } | { error: string };

export async function createMethodAction(raw: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = methodSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await createMethod(parsed.data);
  } catch (e) {
    return {
      error: friendlyError(e, "Metod yaratib bo'lmadi (nom band bo'lishi mumkin)"),
    };
  }
  revalidatePath("/admin/methods");
  revalidatePath("/admin");
  return { success: true };
}

export async function updateMethodAction(
  id: string,
  raw: unknown
): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return { error: "Invalid id" };
  const parsed = methodSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (parsed.data.parentId === id) {
    return { error: "Metod o'ziga parent bo'la olmaydi" };
  }
  try {
    await updateMethod(id, parsed.data);
  } catch (e) {
    return { error: friendlyError(e, "Saqlash muvaffaqiyatsiz tugadi") };
  }
  revalidatePath("/admin/methods");
  revalidatePath("/admin");
  return { success: true };
}

export async function deleteMethodAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return { error: "Invalid id" };
  try {
    await deleteMethod(id);
  } catch (e) {
    return {
      error: friendlyError(
        e,
        "O'chirib bo'lmadi: bu metodga bog'liq masalalar bor. Avval ularni boshqa metodga ko'chiring."
      ),
    };
  }
  revalidatePath("/admin/methods");
  revalidatePath("/admin");
  return { success: true };
}

function friendlyError(e: unknown, fallback: string): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/unique/i.test(msg) || /23505/.test(msg)) {
    return "Bu nomli metod allaqachon mavjud";
  }
  return fallback;
}
```

- [ ] **Step 2: Create the page**

Create `src/app/admin/methods/page.tsx`:

```ts
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { listMethodsWithCounts } from "@/lib/taxonomy/queries";
import { MethodsTree } from "./methods-tree";
import { PageHeader } from "../_components/page-header";

export const metadata: Metadata = {
  title: "Metodlar — Admin",
  description: "Masalalarni yechish metodlari ierarxiyasi.",
};

export default async function MethodsPage() {
  await requireAdmin();
  const methods = await listMethodsWithCounts();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Metodlar"
        subtitle="Masala qanday metod bilan yechilishi (ixtiyoriy)."
      />
      <MethodsTree methods={methods} />
    </div>
  );
}
```

- [ ] **Step 3: Create the methods tree**

Create `src/app/admin/methods/methods-tree.tsx` — mirror of `src/app/admin/topics/topics-tree.tsx` with topic → method substitutions, **no XLSX import button** (methods don't have a bulk-import path), and the leaf-click navigates to `/admin/problems?method=<code>`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  FolderTree,
  Plus,
  Pencil,
  Minus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildMethodTree } from "@/lib/taxonomy/method-codes";
import type { MethodTreeNode } from "@/lib/taxonomy/method-codes";
import { MethodEditDialog, type MethodShape } from "./method-edit-dialog";
import type { MethodWithCount } from "@/lib/taxonomy/queries";

export function MethodsTree({ methods }: { methods: MethodWithCount[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);

  const tree = useMemo(() => buildMethodTree(methods), [methods]);
  const allParentIds = useMemo(() => collectParentIds(tree), [tree]);

  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(allParentIds)
  );

  const allCollapsed = collapsed.size === allParentIds.length;

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function collapseAll() {
    setCollapsed(new Set(allParentIds));
  }
  function expandAll() {
    setCollapsed(new Set());
  }

  const editingMethod =
    editingId !== null && editingId !== "new"
      ? methods.find((m) => m.id === editingId)
      : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground tabular-nums">
          {methods.length} ta metod
        </p>
        <div className="flex items-center gap-2">
          {allParentIds.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={allCollapsed ? expandAll : collapseAll}
              className="text-xs text-muted-foreground"
            >
              {allCollapsed ? (
                <>
                  <Plus data-icon="inline-start" />
                  Hammasini ochish
                </>
              ) : (
                <>
                  <Minus data-icon="inline-start" />
                  Hammasini yopish
                </>
              )}
            </Button>
          )}
          <Button size="sm" onClick={() => setEditingId("new")}>
            <Plus data-icon="inline-start" />
            Yangi metod
          </Button>
        </div>
      </div>

      {tree.length === 0 ? (
        <div className="rounded-xl ring-1 ring-foreground/10 bg-card shadow-sm px-6 py-12 text-center space-y-2">
          <FolderTree
            className="size-7 mx-auto text-muted-foreground"
            aria-hidden
            strokeWidth={1.5}
          />
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Metodlar topilmadi</p>
            <p className="text-xs text-muted-foreground">
              {"Yuqoridagi tugma orqali birinchi metodni qo'shing."}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl ring-1 ring-foreground/10 bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left font-medium px-3 py-2 w-[110px] whitespace-nowrap">
                    Kod
                  </th>
                  <th className="text-left font-medium px-3 py-2">Metod</th>
                  <th className="text-right font-medium px-3 py-2 w-[120px] whitespace-nowrap">
                    Masalalar
                  </th>
                  <th className="w-24 px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {renderRows({
                  nodes: tree,
                  depth: 0,
                  collapsed,
                  onToggle: toggle,
                  onEdit: (id) => setEditingId(id),
                  onOpenLeaf: (code) =>
                    router.push(`/admin/problems?method=${code}`),
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editingId !== null && (
        <MethodEditDialog
          mode={editingId === "new" ? "create" : "edit"}
          method={editingMethod as MethodShape | undefined}
          allMethods={methods}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}

function renderRows({
  nodes,
  depth,
  collapsed,
  onToggle,
  onEdit,
  onOpenLeaf,
}: {
  nodes: MethodTreeNode<MethodWithCount>[];
  depth: number;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  onOpenLeaf: (code: string) => void;
}): React.ReactNode[] {
  const rows: React.ReactNode[] = [];
  for (const node of nodes) {
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.method.id);
    const Chevron = isCollapsed ? ChevronRight : ChevronDown;

    const activate = () => {
      if (hasChildren) onToggle(node.method.id);
      else onOpenLeaf(node.method.code);
    };

    rows.push(
      <tr
        key={node.method.id}
        className={
          "group cursor-pointer transition-colors " +
          "hover:bg-muted/30 focus-visible:bg-muted/40 " +
          "focus:outline-none focus-visible:ring-2 " +
          "focus-visible:ring-[var(--accent-brand)]"
        }
        role="button"
        tabIndex={0}
        aria-label={
          hasChildren
            ? `${node.method.name} — ${isCollapsed ? "ochish" : "yopish"}`
            : `${node.method.name} — masalalarini ko'rish`
        }
        aria-expanded={hasChildren ? !isCollapsed : undefined}
        onClick={activate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            activate();
          }
        }}
      >
        <td className="px-3 py-2 whitespace-nowrap">
          <code className="font-mono text-xs tabular-nums text-muted-foreground">
            {node.method.code}
          </code>
        </td>
        <td className="px-3 py-2">
          <div
            className="flex items-center gap-1.5 min-w-0"
            style={{ paddingLeft: `${depth * 20}px` }}
          >
            {hasChildren ? (
              <span
                className="size-5 inline-flex items-center justify-center text-muted-foreground group-hover:text-foreground transition-colors shrink-0"
                aria-hidden
              >
                <Chevron className="size-3.5" />
              </span>
            ) : (
              <span
                className="size-5 inline-flex items-center justify-center shrink-0"
                aria-hidden
              >
                <span className="size-1 rounded-full bg-muted-foreground/30" />
              </span>
            )}
            <span
              className={
                "inline-flex items-center min-w-0 max-w-full " +
                "rounded-md bg-muted/50 ring-1 ring-foreground/5 " +
                "px-2 py-1 text-sm font-medium " +
                "group-hover:bg-muted group-hover:ring-foreground/10 " +
                "transition-colors"
              }
            >
              <span className="truncate">{node.method.name}</span>
            </span>
          </div>
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">
          {node.method.problemCount}
        </td>
        <td className="px-3 py-2 pr-3 text-right">
          <span
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(node.method.id);
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              <Pencil data-icon="inline-start" />
              Tahrirlash
            </Button>
          </span>
        </td>
      </tr>
    );

    if (hasChildren && !isCollapsed) {
      rows.push(
        ...renderRows({
          nodes: node.children,
          depth: depth + 1,
          collapsed,
          onToggle,
          onEdit,
          onOpenLeaf,
        })
      );
    }
  }
  return rows;
}

function collectParentIds(
  nodes: MethodTreeNode<MethodWithCount>[]
): string[] {
  const ids: string[] = [];
  function walk(ns: MethodTreeNode<MethodWithCount>[]) {
    for (const n of ns) {
      if (n.children.length > 0) {
        ids.push(n.method.id);
        walk(n.children);
      }
    }
  }
  walk(nodes);
  return ids;
}
```

- [ ] **Step 4: Create the edit dialog**

Create `src/app/admin/methods/method-edit-dialog.tsx` — mirror of `topic-edit-dialog.tsx` with topic → method substitutions:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { Layers } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildMethodTree,
  flattenMethodTree,
} from "@/lib/taxonomy/method-codes";
import {
  createMethodAction,
  updateMethodAction,
  deleteMethodAction,
} from "./_actions";

export interface MethodShape {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  description: string | null;
}

const NO_PARENT = "__none__";

export function MethodEditDialog({
  mode,
  method,
  allMethods,
  onClose,
}: {
  mode: "create" | "edit";
  method?: MethodShape;
  allMethods: MethodShape[];
  onClose: () => void;
}) {
  const [name, setName] = useState(method?.name ?? "");
  const [parentId, setParentId] = useState<string>(
    method?.parentId ?? NO_PARENT
  );
  const [description, setDescription] = useState(method?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const flat = useMemo(
    () => flattenMethodTree(buildMethodTree(allMethods)),
    [allMethods]
  );

  const blockedIds = useMemo(() => {
    if (!method) return new Set<string>();
    const childrenByParent = new Map<string, string[]>();
    for (const m of allMethods) {
      if (m.parentId) {
        const arr = childrenByParent.get(m.parentId) ?? [];
        arr.push(m.id);
        childrenByParent.set(m.parentId, arr);
      }
    }
    const blocked = new Set<string>([method.id]);
    const queue = [method.id];
    while (queue.length) {
      const next = queue.shift()!;
      for (const childId of childrenByParent.get(next) ?? []) {
        if (!blocked.has(childId)) {
          blocked.add(childId);
          queue.push(childId);
        }
      }
    }
    return blocked;
  }, [allMethods, method]);

  const parentOptions = flat.filter((n) => !blockedIds.has(n.method.id));

  const selectedParent = parentOptions.find((n) => n.method.id === parentId);

  function onSave() {
    setError(null);
    const payload = {
      name: name.trim(),
      parentId: parentId === NO_PARENT ? null : parentId,
      description: description.trim() || null,
    };
    startTransition(async () => {
      const res =
        mode === "create"
          ? await createMethodAction(payload)
          : await updateMethodAction(method!.id, payload);
      if ("error" in res) {
        setError(res.error);
      } else {
        onClose();
      }
    });
  }

  function onDelete() {
    if (!method) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteMethodAction(method.id);
      if ("error" in res) {
        setError(res.error);
      } else {
        onClose();
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "create" ? "Yangi metod" : "Metodni tahrirlash"}
            {mode === "edit" && method && (
              <code className="font-mono text-xs tabular-nums text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {method.code}
              </code>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="method-name">Nomi</Label>
            <Input
              id="method-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Masalan: Matematik induksiya"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="method-parent">Parent</Label>
            <Select
              value={parentId}
              onValueChange={(v) => setParentId(v ?? NO_PARENT)}
            >
              <SelectTrigger id="method-parent" className="w-full">
                <SelectValue placeholder="Tanlang">
                  {(value) => {
                    if (!value || value === NO_PARENT) {
                      return (
                        <span className="flex items-center gap-2">
                          <Layers
                            className="size-3.5 text-muted-foreground"
                            aria-hidden
                          />
                          Asosiy metod
                        </span>
                      );
                    }
                    return selectedParent?.method.name ?? "Tanlang";
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-[320px]">
                <SelectItem value={NO_PARENT}>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Layers className="size-3.5 shrink-0" aria-hidden />
                    <span>Asosiy metod</span>
                  </span>
                </SelectItem>
                {parentOptions.map(({ method: m, depth }) => (
                  <SelectItem key={m.id} value={m.id}>
                    <ParentRow name={m.name} depth={depth} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="method-desc">Ta&apos;rifi</Label>
            <Textarea
              id="method-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          {mode === "edit" && (
            <Button
              variant="destructive"
              onClick={onDelete}
              disabled={isPending}
              className="mr-auto"
            >
              O&apos;chirish
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Bekor qilish
          </Button>
          <Button
            onClick={onSave}
            disabled={isPending || name.trim().length === 0}
          >
            {isPending ? "Saqlanmoqda…" : "Saqlash"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ParentRow({
  name,
  depth,
}: {
  name: string;
  depth: number;
}) {
  return (
    <span
      className="flex items-center gap-1.5 min-w-0"
      style={{ paddingLeft: `${depth * 14}px` }}
    >
      {depth > 0 && (
        <span className="text-muted-foreground/40 shrink-0" aria-hidden>
          ↳
        </span>
      )}
      <span className="truncate">{name}</span>
    </span>
  );
}
```

- [ ] **Step 5: Add sidebar nav entry**

In `src/app/admin/sidebar-nav.tsx`, extend the lucide-react import to include `Wrench` (or `Sigma` if `Wrench` looks off — pick one that exists in lucide-react; `Wrench` exists and is a fine fit for "metod"):

```ts
import {
  LayoutDashboard,
  BookOpen,
  Library,
  GraduationCap,
  FolderTree,
  FilePlus,
  Wrench,
  type LucideIcon,
} from "lucide-react";
```

In `SECTIONS`, add the Metodlar entry inside the "Taksonomiya" section after "Mavzular":

```ts
{ href: "/admin/topics", label: "Mavzular", icon: FolderTree, prefix: true },
{ href: "/admin/methods", label: "Metodlar", icon: Wrench, prefix: true },
{ href: "/admin/sources", label: "Manbalar", icon: Library, prefix: true },
```

- [ ] **Step 6: Run type-check + lint**

Run: `npx tsc --noEmit` — Expected: no output.
Run: `npx eslint src/app/admin/methods src/app/admin/sidebar-nav.tsx` — Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/methods src/app/admin/sidebar-nav.tsx
git commit -m "feat(methods): /admin/methods CRUD page + sidebar entry"
```

---

## Task 5: Problem form (picker, metadata-form, create/edit pages)

**Files:**
- Create: `src/components/problem-form-pickers/method-tree-picker.tsx`
- Modify: `src/components/metadata-form.tsx`
- Modify: `src/components/problem-form.tsx`
- Modify: `src/app/admin/problems/[id]/edit/page.tsx`
- Modify: `src/app/admin/problems/new/page.tsx`

- [ ] **Step 1: Create the method-tree-picker**

Create `src/components/problem-form-pickers/method-tree-picker.tsx` — full copy of `topic-tree-picker.tsx` with Topic → Method, "Mavzu" → "Metod", "mavzu" → "metod" everywhere. The picker keeps the same multi-select + nested-tree + search + parent-disabled semantics. Selected-badges row stays so admins can see what they picked. Use the exact code below:

```tsx
"use client";

import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  buildMethodTree,
  type MethodTreeNode,
} from "@/lib/taxonomy/method-codes";
import { parentIdSet } from "@/lib/taxonomy/hierarchy";
import type { Method } from "@/db/schema";

/**
 * Multi-select picker for methods. Mirror of TopicTreePicker — nested
 * tree, chevron expand/collapse, search, parent rows disabled (leaf-only
 * rule), selected badges below the trigger.
 */
export function MethodTreePicker({
  available,
  value,
  onChange,
}: {
  available: Method[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const tree = useMemo(() => buildMethodTree(available), [available]);

  const parentSet = useMemo(
    () =>
      parentIdSet(
        available.map((m) => ({ id: m.id, parentId: m.parentId }))
      ),
    [available]
  );

  const allParentIds = useMemo(() => collectParentIds(tree), [tree]);
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(allParentIds)
  );

  const searchLower = search.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!searchLower) {
      return {
        allow: null as Set<string> | null,
        expandedExtra: new Set<string>(),
      };
    }
    const allow = new Set<string>();
    const expandedExtra = new Set<string>();
    function walk(node: MethodTreeNode<Method>, ancestors: string[]) {
      const matches = node.method.name.toLowerCase().includes(searchLower);
      if (matches) {
        allow.add(node.method.id);
        for (const a of ancestors) {
          allow.add(a);
          expandedExtra.add(a);
        }
      }
      for (const child of node.children) {
        walk(child, [...ancestors, node.method.id]);
      }
    }
    for (const root of tree) walk(root, []);
    return { allow, expandedExtra };
  }, [searchLower, tree]);

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelect(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
      return;
    }
    if (parentSet.has(id)) return;
    onChange([...value, id]);
  }

  const selected = available.filter(
    (m) => value.includes(m.id) && !parentSet.has(m.id)
  );

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between"
            >
              <span className="text-sm text-muted-foreground">
                {selected.length === 0
                  ? "Metodlarni tanlang…"
                  : `${selected.length} ta tanlangan`}
              </span>
              <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
            </Button>
          }
        />
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
        >
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search
              className="size-3.5 text-muted-foreground shrink-0"
              aria-hidden
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Metod qidirish…"
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
          </div>

          <div className="max-h-[320px] overflow-auto py-1">
            {tree.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                Metodlar topilmadi
              </p>
            ) : (
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
            )}
          </div>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((m) => (
            <Badge key={m.id} variant="secondary" className="gap-1">
              {m.name}
              <button
                type="button"
                aria-label={`${m.name} ni olib tashlash`}
                onClick={() => toggleSelect(m.id)}
                className="hover:opacity-70"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

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
  nodes: MethodTreeNode<Method>[];
  depth: number;
  collapsed: Set<string>;
  expandedExtra: Set<string>;
  allow: Set<string> | null;
  selectedIds: string[];
  parentSet: Set<string>;
  onToggleCollapse: (id: string) => void;
  onToggleSelect: (id: string) => void;
}): React.ReactNode {
  return (
    <>
      {nodes.map((node) => {
        if (allow && !allow.has(node.method.id)) return null;
        const hasChildren = node.children.length > 0;
        const isCollapsed =
          collapsed.has(node.method.id) &&
          !expandedExtra.has(node.method.id);
        const isSelected = selectedIds.includes(node.method.id);
        const Chevron = isCollapsed ? ChevronRight : ChevronDown;

        return (
          <div key={node.method.id}>
            <div
              role={parentSet.has(node.method.id) ? undefined : "button"}
              tabIndex={parentSet.has(node.method.id) ? undefined : 0}
              className={cn(
                "group flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-sm transition-colors",
                parentSet.has(node.method.id)
                  ? "cursor-default text-muted-foreground"
                  : "cursor-pointer hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand)]",
                isSelected && "bg-[var(--accent-brand)]/5"
              )}
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
              aria-disabled={parentSet.has(node.method.id) || undefined}
              aria-label={
                parentSet.has(node.method.id)
                  ? undefined
                  : isSelected
                    ? `${node.method.name} metodini tanlovdan olib tashlash`
                    : `${node.method.name} metodini tanlash`
              }
              title={
                parentSet.has(node.method.id)
                  ? "Faqat ichki metod tanlanadi — bu guruh"
                  : undefined
              }
              onClick={() => {
                if (parentSet.has(node.method.id)) return;
                onToggleSelect(node.method.id);
              }}
              onKeyDown={(e) => {
                if (parentSet.has(node.method.id)) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggleSelect(node.method.id);
                }
              }}
            >
              {hasChildren ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleCollapse(node.method.id);
                  }}
                  className="size-4 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground shrink-0"
                  aria-label={
                    isCollapsed
                      ? `${node.method.name}ni ochish`
                      : `${node.method.name}ni yopish`
                  }
                >
                  <Chevron className="size-3.5" aria-hidden />
                </button>
              ) : (
                <span className="size-4 shrink-0" aria-hidden />
              )}

              <span
                className={cn(
                  "shrink-0 size-4 rounded border flex items-center justify-center transition-colors",
                  isSelected
                    ? "border-[var(--accent-brand)] bg-[var(--accent-brand)] text-white"
                    : "border-foreground/20 bg-card"
                )}
                aria-hidden
              >
                {isSelected && <Check className="size-3" strokeWidth={3} />}
              </span>

              <span
                className={cn(
                  "truncate flex-1",
                  isSelected && "font-medium text-[var(--accent-brand-strong)]"
                )}
              >
                {node.method.name}
              </span>
            </div>

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
          </div>
        );
      })}
    </>
  );
}

function collectParentIds(nodes: MethodTreeNode<Method>[]): string[] {
  const ids: string[] = [];
  function walk(ns: MethodTreeNode<Method>[]) {
    for (const n of ns) {
      if (n.children.length > 0) {
        ids.push(n.method.id);
        walk(n.children);
      }
    }
  }
  walk(nodes);
  return ids;
}
```

- [ ] **Step 2: Extend metadata-form.tsx to render the methods picker**

In `src/components/metadata-form.tsx`:

Extend imports:

```ts
import { MethodTreePicker } from "@/components/problem-form-pickers/method-tree-picker";
import type { Topic, AgeCategory, Method } from "@/db/schema";
```

Extend the props interface:

```ts
export interface MetadataFormProps {
  topicsAvailable: Topic[];
  sourcesAvailable: SourcePickerNode[];
  ageCategoriesAvailable: AgeCategory[];
  methodsAvailable: Method[];
}
```

Add the parameter to the function:

```ts
export function MetadataForm({
  topicsAvailable,
  sourcesAvailable,
  ageCategoriesAvailable,
  methodsAvailable,
}: MetadataFormProps) {
```

Inside the form (after the Age category block, as the last grid section), add the Methods block:

```tsx
{/* Methods — optional, can be zero or more. */}
<div className="space-y-2 lg:col-span-2">
  <div className="flex items-baseline justify-between gap-2">
    <Label>Metodlar</Label>
    <span className="text-[11px] text-muted-foreground italic">
      ixtiyoriy
    </span>
  </div>
  <Controller
    control={control}
    name="methodIds"
    render={({ field }) => (
      <MethodTreePicker
        available={methodsAvailable}
        value={field.value ?? []}
        onChange={field.onChange}
      />
    )}
  />
  <FieldError message={errors.methodIds?.message} />
</div>
```

- [ ] **Step 3: Extend problem-form.tsx with methodIds field**

In `src/components/problem-form.tsx`:

Extend the imports:

```ts
import type { Topic, AgeCategory, Method } from "@/db/schema";
```

Extend the form schema:

```ts
const formSchema = z.object({
  bodyMd: z.string().min(1, "Masala matni bo'sh bo'lmasligi kerak"),
  sourceId: z.string().uuid("Manbani tanlang"),
  topicIds: z.array(z.string()).min(1, "Kamida bitta mavzu tanlang"),
  ageCategoryIds: z
    .array(z.string())
    .min(1, "Kamida bitta yosh toifasini tanlang"),
  // Methods are optional — zero or more allowed. No min(1).
  methodIds: z.array(z.string()).default([]),
  image: imageSchema.nullable(),
});
```

Extend `ProblemFormProps`:

```ts
export interface ProblemFormProps {
  mode: "create" | "edit";
  problemId?: string;
  defaultValues: ProblemFormValues;
  topicsAvailable: Topic[];
  sourcesAvailable: SourcePickerNode[];
  ageCategoriesAvailable: AgeCategory[];
  methodsAvailable: Method[];
  uploadPrefix: string;
}
```

Destructure in the component and forward to `MetadataForm`:

```ts
export function ProblemForm({
  mode,
  problemId,
  defaultValues,
  topicsAvailable,
  sourcesAvailable,
  ageCategoriesAvailable,
  methodsAvailable,
  uploadPrefix,
}: ProblemFormProps) {
```

```tsx
<MetadataForm
  topicsAvailable={topicsAvailable}
  sourcesAvailable={sourcesAvailable}
  ageCategoriesAvailable={ageCategoriesAvailable}
  methodsAvailable={methodsAvailable}
/>
```

- [ ] **Step 4: Wire the edit page**

In `src/app/admin/problems/[id]/edit/page.tsx`:

Extend the schema imports:

```ts
import { topics, ageCategories, methods } from "@/db/schema";
```

Extend the `Promise.all`:

```ts
const [p, topicsAvailable, sourcesAvailable, ageCategoriesAvailable, methodsAvailable] =
  await Promise.all([
    getProblemByCode(code),
    db.select().from(topics).orderBy(topics.name),
    listSourcesWithCounts(),
    db.select().from(ageCategories).orderBy(ageCategories.code),
    db.select().from(methods).orderBy(methods.code),
  ]);
```

Extend `defaultValues` and `<ProblemForm>`:

```tsx
<ProblemForm
  mode="edit"
  problemId={p.code}
  defaultValues={{
    bodyMd: p.bodyMd,
    sourceId: p.sourceId,
    topicIds: p.topics.map((t) => t.id),
    ageCategoryIds: p.ageCategories.map((c) => c.id),
    methodIds: p.methods.map((m) => m.id),
    image: p.images[0]
      ? {
          storageKey: p.images[0].storageKey,
          publicUrl: getPublicUrl(p.images[0].storageKey),
          originalFilename: p.images[0].originalFilename,
          sizeBytes: p.images[0].sizeBytes,
          mimeType: p.images[0].mimeType,
        }
      : null,
  }}
  topicsAvailable={topicsAvailable}
  sourcesAvailable={sourcesAvailable}
  ageCategoriesAvailable={ageCategoriesAvailable}
  methodsAvailable={methodsAvailable}
  uploadPrefix={`problems/${p.id}`}
/>
```

- [ ] **Step 5: Wire the new-problem page**

In `src/app/admin/problems/new/page.tsx`:

Extend the schema imports:

```ts
import { topics, ageCategories, methods } from "@/db/schema";
```

Extend the `Promise.all`:

```ts
const [topicsAvailable, sourcesAvailable, ageCategoriesAvailable, methodsAvailable] =
  await Promise.all([
    db.select().from(topics).orderBy(topics.name),
    listSourcesWithCounts(),
    db.select().from(ageCategories).orderBy(ageCategories.code),
    db.select().from(methods).orderBy(methods.code),
  ]);
```

Extend the `<ProblemForm>`:

```tsx
<ProblemForm
  mode="create"
  defaultValues={{
    bodyMd: "",
    sourceId: "",
    topicIds: [],
    ageCategoryIds: [],
    methodIds: [],
    image: null,
  }}
  topicsAvailable={topicsAvailable}
  sourcesAvailable={sourcesAvailable}
  ageCategoriesAvailable={ageCategoriesAvailable}
  methodsAvailable={methodsAvailable}
  uploadPrefix="problems/draft"
/>
```

- [ ] **Step 6: Run type-check + lint**

Run: `npx tsc --noEmit` — Expected: no output.
Run: `npx eslint src/components src/app/admin/problems/new src/app/admin/problems/[id]/edit` — Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/components/problem-form-pickers/method-tree-picker.tsx src/components/metadata-form.tsx src/components/problem-form.tsx src/app/admin/problems/[id]/edit/page.tsx src/app/admin/problems/new/page.tsx
git commit -m "feat(methods): optional methods picker on problem form"
```

---

## Task 6: Problem detail — methods chips in sidebar

**Files:**
- Modify: `src/app/admin/problems/[id]/page.tsx`

- [ ] **Step 1: Render methods in the metadata sidebar**

In `src/app/admin/problems/[id]/page.tsx`:

Extend the lucide-react import to include `Wrench`:

```ts
import {
  CalendarDays,
  ChevronRight,
  Hash,
  Library,
  Pencil,
  Tags,
  Wrench,
} from "lucide-react";
```

Inside the metadata sidebar (after the `Mavzular` MetaRow block, before the closing `</div>` that wraps the metadata rows), add:

```tsx
{p.methods.length > 0 && (
  <MetaRow label="Metodlar" icon={Wrench}>
    <div className="flex flex-wrap gap-1">
      {p.methods.map((m) => (
        <Link
          key={m.id}
          href={`/admin/problems?method=${m.code}`}
          title={`Faqat ${m.name} metodi`}
          className="inline-flex items-center gap-1 rounded-md ring-1 ring-foreground/10 bg-muted/30 hover:bg-muted hover:ring-foreground/25 px-1.5 py-0.5 text-[11px] text-foreground/85 transition-colors"
        >
          <span className="truncate">{m.name}</span>
        </Link>
      ))}
    </div>
  </MetaRow>
)}
```

- [ ] **Step 2: Run type-check + lint**

Run: `npx tsc --noEmit` — Expected: no output.
Run: `npx eslint src/app/admin/problems/[id]/page.tsx` — Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/problems/[id]/page.tsx
git commit -m "feat(methods): show method chips on problem detail page"
```

---

## Task 7: Problems list — URL state + filter popover + bulk edit

**Files:**
- Modify: `src/app/admin/problems/_url-state.ts`
- Modify: `src/app/admin/problems/page.tsx`
- Modify: `src/app/admin/problems/filters.tsx`
- Modify: `src/app/admin/problems/problems-list.tsx`
- Modify: `src/app/admin/problems/bulk-edit-dialog.tsx`

- [ ] **Step 1: Parse `method` from URL state**

In `src/app/admin/problems/_url-state.ts`, extend the filters block:

```ts
const filters: ProblemListFilters = {
  search: sp.get("q") ?? undefined,
  sourceCodes: csv(sp.get("source")),
  ageCategoryCodes: csv(sp.get("ageCategory")),
  topicCodes: csv(sp.get("topic")),
  methodCodes: csv(sp.get("method")),
};
```

- [ ] **Step 2: Fetch the methods dictionary on the list page**

In `src/app/admin/problems/page.tsx`:

Extend the schema imports:

```ts
import { ageCategories, sources, topics, methods } from "@/db/schema";
```

Extend the `Promise.all`:

```ts
const [
  { rows, total },
  sourcesAvailable,
  ageCategoriesAvailable,
  topicsAvailable,
  methodsAvailable,
] = await Promise.all([
  listProblems(filters, sort, page, pageSize),
  db
    .select({
      id: sources.id,
      code: sources.code,
      name: sources.name,
      parentId: sources.parentId,
    })
    .from(sources)
    .orderBy(sources.code),
  db
    .select({
      id: ageCategories.id,
      code: ageCategories.code,
      name: ageCategories.name,
    })
    .from(ageCategories)
    .orderBy(ageCategories.code),
  db
    .select({
      id: topics.id,
      code: topics.code,
      name: topics.name,
      parentId: topics.parentId,
    })
    .from(topics)
    .orderBy(topics.name),
  db
    .select({
      id: methods.id,
      code: methods.code,
      name: methods.name,
      parentId: methods.parentId,
    })
    .from(methods)
    .orderBy(methods.name),
]);
```

Pass `methodsAvailable` to both `ProblemsFilterBar` and `ProblemsList`:

```tsx
<ProblemsFilterBar
  sourcesAvailable={sourcesAvailable}
  ageCategoriesAvailable={ageCategoriesAvailable}
  topicsAvailable={topicsAvailable}
  methodsAvailable={methodsAvailable}
  sort={sort}
/>

<ProblemsList
  rows={rows}
  total={total}
  page={page}
  pageSize={pageSize}
  sourcesAvailable={sourcesAvailable}
  ageCategoriesAvailable={ageCategoriesAvailable}
  topicsAvailable={topicsAvailable}
  methodsAvailable={methodsAvailable}
/>
```

- [ ] **Step 3: Add Methods popover to filters.tsx**

In `src/app/admin/problems/filters.tsx`:

Extend the lucide-react import to add `Wrench`:

```ts
import {
  ArrowDownAZ,
  ArrowUpAZ,
  CalendarArrowDown,
  CalendarArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Filter,
  Hash,
  Library,
  Search,
  Tags,
  Wrench,
  X,
} from "lucide-react";
```

Extend the props interface:

```ts
export function ProblemsFilterBar({
  sourcesAvailable,
  ageCategoriesAvailable,
  topicsAvailable,
  methodsAvailable,
  sort,
}: {
  sourcesAvailable: FilterOption[];
  ageCategoriesAvailable: FilterOption[];
  topicsAvailable: FilterOption[];
  methodsAvailable: FilterOption[];
  sort: ProblemListSort;
}) {
```

Add `methodCodes`:

```ts
const methodCodes = csv(params.get("method"));

const activeFilterCount =
  (search ? 1 : 0) +
  sourceCodes.length +
  ageCategoryCodes.length +
  topicCodes.length +
  methodCodes.length;
```

Add the code-keyed dictionary block (parallel of `topicOptionsByCode`):

```ts
const methodOptionsByCode = useMemo<FilterOption[]>(() => {
  const idToCode = new Map(methodsAvailable.map((m) => [m.id, m.code]));
  return methodsAvailable.map((m) => ({
    id: m.code,
    code: m.code,
    name: m.name,
    parentId: m.parentId ? (idToCode.get(m.parentId) ?? null) : null,
  }));
}, [methodsAvailable]);

const methodByCode = useMemo(
  () => new Map(methodsAvailable.map((m) => [m.code, m])),
  [methodsAvailable]
);
```

Extend `clearAll` to also delete `method`:

```ts
function clearAll() {
  const next = new URLSearchParams(params.toString());
  next.delete("q");
  next.delete("source");
  next.delete("ageCategory");
  next.delete("topic");
  next.delete("method");
  push(next);
}
```

Add the `<FilterPopover>` after the Topics popover:

```tsx
<FilterPopover
  label="Mavzular"
  icon={<Tags className="size-3.5" aria-hidden />}
  count={topicCodes.length}
  options={topicOptionsByCode}
  selected={topicCodes}
  onChange={(codes) => setCsv("topic", codes)}
/>
<FilterPopover
  label="Metodlar"
  icon={<Wrench className="size-3.5" aria-hidden />}
  count={methodCodes.length}
  options={methodOptionsByCode}
  selected={methodCodes}
  onChange={(codes) => setCsv("method", codes)}
/>
```

Inside the active-chip rendering block (after the `topicCodes.map((code) => …)` block, before the `clearAll` button), add:

```tsx
{methodCodes.map((code) => {
  const m = methodByCode.get(code);
  if (!m) return null;
  return (
    <ActiveChip
      key={`m-${code}`}
      label={m.name}
      kind="Metod"
      onRemove={() =>
        setCsv(
          "method",
          methodCodes.filter((x) => x !== code)
        )
      }
    />
  );
})}
```

- [ ] **Step 4: Forward methodsAvailable through problems-list.tsx**

In `src/app/admin/problems/problems-list.tsx`:

Extend the props interface:

```ts
export interface ProblemsListProps {
  rows: ProblemListResult["rows"];
  total: number;
  page: number;
  pageSize: number;
  sourcesAvailable: FilterOption[];
  ageCategoriesAvailable: FilterOption[];
  topicsAvailable: FilterOption[];
  methodsAvailable: FilterOption[];
}
```

Destructure and forward:

```ts
export function ProblemsList({
  rows,
  total,
  page,
  pageSize,
  sourcesAvailable,
  ageCategoriesAvailable,
  topicsAvailable,
  methodsAvailable,
}: ProblemsListProps) {
```

```tsx
<BulkEditDialog
  open={bulkEditOpen}
  onOpenChange={setBulkEditOpen}
  problemIds={Array.from(selected)}
  sourcesAvailable={sourcesAvailable}
  ageCategoriesAvailable={ageCategoriesAvailable}
  topicsAvailable={topicsAvailable}
  methodsAvailable={methodsAvailable}
  onSuccess={() => {
    setSelected(new Set());
    router.refresh();
  }}
/>
```

- [ ] **Step 5: Add Methods field to bulk-edit-dialog.tsx**

In `src/app/admin/problems/bulk-edit-dialog.tsx`:

Extend the lucide-react import to add `Wrench`:

```ts
import { Hash, Library, Tags, Wrench } from "lucide-react";
```

Extend the props interface:

```ts
export function BulkEditDialog({
  open,
  onOpenChange,
  problemIds,
  sourcesAvailable,
  ageCategoriesAvailable,
  topicsAvailable,
  methodsAvailable,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  problemIds: string[];
  sourcesAvailable: FilterOption[];
  ageCategoriesAvailable: FilterOption[];
  topicsAvailable: FilterOption[];
  methodsAvailable: FilterOption[];
  onSuccess: () => void;
}) {
```

Add `methodIds` state alongside the others:

```ts
const [methodIds, setMethodIds] = useState<string[]>([]);
```

In `reset()`:

```ts
function reset() {
  setSourceId(undefined);
  setAgeCategoryIds([]);
  setTopicIds([]);
  setMethodIds([]);
  setError(null);
}
```

In `hasAnyChange`:

```ts
const hasAnyChange =
  sourceId !== undefined ||
  ageCategoryIds.length > 0 ||
  topicIds.length > 0 ||
  methodIds.length > 0;
```

In `onSubmit`:

```ts
const payload: {
  ids: string[];
  sourceId?: string;
  ageCategoryIds?: string[];
  topicIds?: string[];
  methodIds?: string[];
} = { ids: problemIds };
if (sourceId) payload.sourceId = sourceId;
if (ageCategoryIds.length > 0) payload.ageCategoryIds = ageCategoryIds;
if (topicIds.length > 0) payload.topicIds = topicIds;
if (methodIds.length > 0) payload.methodIds = methodIds;
```

After the Mavzular Field in the JSX, add the Metodlar Field:

```tsx
<Field
  label="Metodlar"
  hint="Mavjud metodlar ushbu ro'yxat bilan almashtiriladi."
>
  <FilterPopover
    label="Tanlang"
    icon={<Wrench className="size-3.5" aria-hidden />}
    count={methodIds.length}
    options={methodsAvailable}
    selected={methodIds}
    onChange={setMethodIds}
    mode="leaf-only"
  />
</Field>
```

- [ ] **Step 6: Run type-check + lint**

Run: `npx tsc --noEmit` — Expected: no output.
Run: `npx eslint src/app/admin/problems` — Expected: no output.

- [ ] **Step 7: Smoke-test the filter URL works**

Open the dev server (`npm run dev`), navigate to `/admin/problems?method=M000001` (replace with an actual method code created via the new `/admin/methods` page first). Verify:
- the URL renders without error
- the Metodlar popover shows the filter active
- removing the chip via the "X" navigates back without the `method` param

If the route 404s or the popover doesn't show, the bug is in this task — fix before committing.

- [ ] **Step 8: Commit**

```bash
git add src/app/admin/problems/_url-state.ts src/app/admin/problems/page.tsx src/app/admin/problems/filters.tsx src/app/admin/problems/problems-list.tsx src/app/admin/problems/bulk-edit-dialog.tsx
git commit -m "feat(methods): list filter + bulk edit support for methods"
```

---

## Self-review summary

**Coverage of requirements:**
1. *New `metod` property on problems* — Task 1 (DB) + Task 3 (mutations/queries).
2. *Optional on single-problem form, not asked at import* — Task 3 (schema `.optional().default([])`), Task 5 (form schema `.default([])`, "ixtiyoriy" label); import code untouched.
3. *UI same shape as Mavzular* — Task 4 (CRUD page mirrors topics), Task 5 (picker mirrors topic picker), Task 6 (detail chips), Task 7 (filter + bulk edit).
4. *Methods nested* — Task 1 (self-referencing parent_id), Task 4 (tree + parent picker), Task 5 (nested tree picker).
5. *Not requested in import* — confirmed by leaving `src/lib/import/*.ts` untouched.

**Type consistency check:** Method-related identifiers used consistently — `MethodInput`, `MethodWithCount`, `MethodShape`, `MethodTreeNode`, `Method` (DB), `methodIds` (form/mutation), `methodCodes` (URL/filter).

**Parallelism:**
- Tasks 1 → 2 → 3 are sequential (each depends on the previous).
- Tasks 4, 5, 6, 7 can all run **in parallel** after Task 3 completes — they touch disjoint files (Task 5 touches `new/page.tsx` + `[id]/edit/page.tsx`; Task 6 touches `[id]/page.tsx`; Task 7 touches the list-page family; Task 4 touches the new `/admin/methods/*` tree + `sidebar-nav.tsx`).
