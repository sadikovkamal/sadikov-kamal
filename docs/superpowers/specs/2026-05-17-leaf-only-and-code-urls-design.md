# Leaf-only taxonomy rule + filter expansion + code-based URLs — design

**Date:** 2026-05-17

**Scope:** Three small, related changes to how the problems admin handles taxonomy:

1. A problem may only be assigned to a **leaf** topic or source — a node with no children. Enforced in every place that sets a problem's source/topics: create form, edit form, bulk-edit modal, and problem ZIP import.
2. In the filter bar, selecting a **parent** topic or source matches every descendant, not just the literal selection.
3. The list URL stops embedding UUIDs and uses the human-readable `T######` / `S######` / `A######` codes instead.

## Non-goals

- Migrating existing data. The user confirmed no problems currently sit on parent nodes.
- DB-level enforcement (e.g. a CHECK constraint that the topic has no children). Tree-shape constraints are awkward to express in SQL; the application layer covers create, update, and import, and a smoke test asserts nothing slipped through.
- Topic / source XLSX/ZIP import flows for taxonomy themselves — the rule applies to *problems*, not to importing nodes.
- Changing the picker UX in ways unrelated to this rule.

## Concept: leaf-only

A node is a **leaf** when no other node has it as `parentId`. This is the standard tree-leaf definition; the existing tree builders (`buildTopicTree`, the flatten helpers in `filters.tsx`) already compute "hasChildren" for rendering — we factor that knowledge into a reusable helper.

The rule applies wherever a problem's source/topics are **set**. It explicitly does NOT apply where the user is **filtering** — picking a parent there is a deliberate "match everything under this branch" shortcut (covered by part 2).

## Part 1 — Leaf-only enforcement

### Shared helper

New module `src/lib/taxonomy/hierarchy.ts` (no React, no DB — pure functions usable from both server and client):

```ts
export interface NodeRef {
  id: string;
  parentId: string | null;
}

/** All ids that appear as someone's parentId — i.e. the non-leaf set. */
export function parentIdSet(nodes: Iterable<NodeRef>): Set<string>;

/** True if `id` is a leaf (no node has it as parentId). */
export function isLeaf(id: string, parents: Set<string>): boolean;

/**
 * Expand a list of ancestor ids into the full set of ids in their subtrees
 * (including the ancestors themselves). Order is unspecified; the result
 * is intended for use in an `IN (...)` clause.
 */
export function withDescendants(
  ancestorIds: Iterable<string>,
  nodes: Iterable<NodeRef>
): string[];
```

These three functions cover every read pattern we need: `parentIdSet` (for "is this a parent?" checks in pickers and import validation), `isLeaf` (a thin wrapper for readability), and `withDescendants` (for the filter expansion in part 2).

### Single-problem form pickers

`TopicTreePicker` and `SourcePicker` both already know about `hasChildren` per node and render a "guruh" badge for parents. We extend that:

- Compute the parent set once at the top of each picker.
- A parent row's checkbox is rendered as **disabled**: the click handler short-circuits, the row gets `aria-disabled` and a `text-muted-foreground` tone, and a `title` tooltip explains why ("Faqat ichki mavzu tanlanadi — bu guruh").
- If `value` happens to contain a parent id (e.g. coming back from a stale draft), the picker silently filters it out of the displayed selection chips so the user can't get stuck.

The chevron stays interactive — admins still need to drill into the tree.

### Bulk-edit modal

`BulkEditDialog` reuses `FilterPopover`. We add a new optional prop:

```ts
mode?: "filter" | "leaf-only"; // default "filter"
```

In `"leaf-only"` mode the popover behaves like the form pickers: parent rows are disabled, click is a no-op. In `"filter"` (default), the current behavior is preserved — parents are clickable and selecting one will match descendants in the listing query.

The dialog passes `mode="leaf-only"` for both source and topics selectors (age categories are flat — the prop is harmless there).

### Problem ZIP import validation

`src/lib/import/validate.ts` already resolves `S######` / `T######` codes to UUIDs and reports per-problem errors. After resolution we now also check the parent set:

```
Manba parent guruh: S000001 (faqat ichki manba tanlanadi)
Mavzu parent guruh: T000003 (faqat ichki mavzu tanlanadi)
```

These are row-level errors (not bundle errors) — only the offending problem is rejected, the rest of the bundle still validates and can still be imported once the admin fixes their ZIP.

### Server-side belt and braces

`createProblemTx`, `updateProblemTx`, and `bulkUpdateProblemsTx` all currently trust the action layer to validate. We add a single guard in each mutation that, before touching the junction tables, looks up the parent set for the referenced ids and throws a clear error if any id is a parent. The error bubbles up through the existing zod-error path in `_actions.ts` as a friendly message.

This catches the case of a tampered client and keeps the rule honest regardless of UI.

## Part 2 — Filter expansion to descendants

`listProblems` in `src/lib/problems/queries.ts` is the single entry point for the filtered listing.

When `filters.topicIds` or `filters.sourceIds` contains any id that is a parent, we expand those ids into the full subtree before building the EXISTS subquery. Concretely:

1. If `topicIds?.length`: read `id, parentId` for every topic (one query, small table) and call `withDescendants(filters.topicIds, allTopics)`. Use the expanded array in the existing `inArray(problemTopics.topicId, ...)` filter.
2. Same for `sourceIds` against `problems.sourceId`.

When neither has parents, the expansion is a no-op (`withDescendants` returns the input unchanged).

The UI doesn't change: chips, popover selection state, and the URL still record the user's literal pick. The "what matches" is decided server-side.

## Part 3 — Code-based URLs

### URL format

```
Before:  ?source=<uuid1>,<uuid2>&topic=<uuid3>&ageCategory=<uuid4>
After:   ?source=S000001,S000002&topic=T000003&ageCategory=A000001
```

### Boundary conversion

The conversion sits at exactly two seams:

**Reading the URL → IDs.** `parseSearchParams` returns codes (the input is already CSV strings; we just rename the fields to `sourceCodes`, `ageCategoryCodes`, `topicCodes`). `page.tsx` already has `sourcesAvailable` / `topicsAvailable` / `ageCategoriesAvailable` fetched — it converts codes → UUIDs using a `code → id` Map, drops unknown codes silently, and hands the UUID arrays to `listProblems`.

**Writing URL ← user selection.** `ProblemsFilterBar` already builds `URLSearchParams` on every change. We add the same conversion in reverse: take the FilterPopover's new selection (UUIDs internally), look up codes, set the URL.

`FilterPopover` itself keeps working in UUIDs — none of its checkbox toggling, search, or nested-tree logic changes. Only the page-level glue translates.

### Edge cases

- Unknown code in URL (taxonomy node deleted after a shared link): silently dropped. The page renders without that filter rather than error.
- Conversion is O(N) lookups with N = number of selected items. Dictionaries are already in memory; cost is negligible.
- Bookmark / back-navigation still works — URL is the source of truth.

## Component touchpoints

| File | Change |
|---|---|
| `src/lib/taxonomy/hierarchy.ts` | **New.** Pure helpers: `parentIdSet`, `isLeaf`, `withDescendants`. |
| `src/lib/problems/queries.ts` | `listProblems` expands topic/source filters via `withDescendants`. |
| `src/lib/problems/mutations.ts` | `createProblemTx`, `updateProblemTx`, `bulkUpdateProblemsTx` guard against parent ids. |
| `src/lib/import/validate.ts` | Per-problem error when a source/topic code is a parent. |
| `src/components/problem-form-pickers/topic-tree-picker.tsx` | Parent rows disabled + tooltip; silent filter on stale `value`. |
| `src/components/problem-form-pickers/source-picker.tsx` | Same. |
| `src/app/admin/problems/filters.tsx` | `FilterPopover` gains `mode: "filter" \| "leaf-only"` prop; `ProblemsFilterBar` does code↔UUID conversion. |
| `src/app/admin/problems/bulk-edit-dialog.tsx` | Pass `mode="leaf-only"` to source + topic popovers. |
| `src/app/admin/problems/_url-state.ts` | Field rename: `sourceCodes`, `ageCategoryCodes`, `topicCodes`. |
| `src/app/admin/problems/page.tsx` | Code → UUID lookup before calling `listProblems`. |
| `scripts/leaf-rule-smoke.ts` | **New.** Smoke test that exercises the mutation guards, the filter expansion, and the helper functions. |
| `scripts/run-all-smokes.sh` | Register `leaf-rule-smoke.ts`. |

## Error handling

| Failure | Behavior |
|---|---|
| Picker click on a parent in leaf-only mode | No-op; tooltip explains. |
| Stale draft with a parent id in `value` | Picker silently filters it out of displayed chips. |
| Mutation called with a parent id | Throws `"Parent guruhga masala biriktirib bo'lmaydi"` — action layer surfaces it as the friendly error. |
| Import ZIP with parent codes | Per-problem error; rest of bundle validates normally. |
| URL has an unknown code | Filter is dropped silently; rest of URL state survives. |
| URL has a code that resolves to a parent | Treated as a normal filter — descendants get expanded. (This is the filter side, where parents are valid.) |

## Smoke test outline

`scripts/leaf-rule-smoke.ts` (mirrors the existing smoke style):

1. **Helpers.** Sanity-check `parentIdSet`, `isLeaf`, `withDescendants` on a synthetic 3-level tree.
2. **Mutation guards.** Try to `createProblemTx({ sourceId: <a parent> })` and expect a throw. Same for `updateProblemTx` and `bulkUpdateProblemsTx`.
3. **Listing expansion.** Create fixtures: a parent topic with two leaf children, one problem per leaf. `listProblems({ topicIds: [parentId] })` returns both problems.
4. **Audit.** Read every `(problem_id, topic_id)` and `(problem_id, source_id)` pair, cross-check against the parent set. Asserts the existing data is leaf-clean — backs up the user's claim and turns into a regression alarm if a future change re-introduces parent assignments.

All fixtures are cleaned up at the end. Smoke exits `Smoke: PASSED` on success.

## Open questions

None at design time.
