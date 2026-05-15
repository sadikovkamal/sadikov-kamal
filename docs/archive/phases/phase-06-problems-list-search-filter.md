# Phase 6 — Problems List, Search, Filter

**Goal:** A fast, filterable, searchable list of all problems at
`/admin/problems`. URL-based state for filters so links are shareable.
Server-side pagination. Full-text search using the GIN index from Phase 1.

**Estimated time:** 1.5 sessions (~4-5 hours)

---

## What you'll have at the end

- `/admin/problems` — table of problems with key metadata
- Sidebar with filters: source, year range, difficulty, classes, topics, tags
- Full-text search box that searches `body_md`
- Sortable columns (created date, difficulty, source/year)
- Pagination (offset-based for MVP)
- All filter/sort/page state lives in the URL — refresh-safe and shareable
- Bulk delete with checkbox selection and confirm dialog

---

## Steps

### 6.1. List query with filters

Add to `src/lib/problems/queries.ts`:

```typescript
import {
  and,
  eq,
  inArray,
  gte,
  lte,
  desc,
  asc,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  problems,
  problemTopics,
  problemTags,
  problemClasses,
  sources,
  topics,
  tags,
} from "@/db/schema";

export interface ProblemListFilters {
  search?: string;
  sourceIds?: string[];
  yearFrom?: number;
  yearTo?: number;
  difficulties?: number[];
  classes?: number[];
  topicIds?: string[];
  tagIds?: string[];
}

export interface ProblemListSort {
  field: "createdAt" | "difficulty" | "year";
  direction: "asc" | "desc";
}

export interface ProblemListResult {
  rows: Array<{
    id: string;
    bodyPreview: string;
    sourceName: string;
    year: number | null;
    problemNumber: string | null;
    difficulty: number;
    createdAt: Date;
    topicNames: string[];
    classes: number[];
  }>;
  total: number;
}

export async function listProblems(
  filters: ProblemListFilters,
  sort: ProblemListSort,
  page: number,
  pageSize: number
): Promise<ProblemListResult> {
  const conds: SQL[] = [];

  if (filters.search?.trim()) {
    // websearch_to_tsquery is forgiving with user input
    conds.push(
      sql`to_tsvector('simple', ${problems.bodyMd}) @@ websearch_to_tsquery('simple', ${filters.search})`
    );
  }
  if (filters.sourceIds?.length) {
    conds.push(inArray(problems.sourceId, filters.sourceIds));
  }
  if (filters.yearFrom !== undefined) {
    conds.push(gte(problems.year, filters.yearFrom));
  }
  if (filters.yearTo !== undefined) {
    conds.push(lte(problems.year, filters.yearTo));
  }
  if (filters.difficulties?.length) {
    conds.push(inArray(problems.difficulty, filters.difficulties));
  }
  if (filters.classes?.length) {
    conds.push(
      sql`EXISTS (SELECT 1 FROM ${problemClasses} pc WHERE pc.problem_id = ${problems.id} AND pc.class_number IN ${filters.classes})`
    );
  }
  if (filters.topicIds?.length) {
    conds.push(
      sql`EXISTS (SELECT 1 FROM ${problemTopics} pt WHERE pt.problem_id = ${problems.id} AND pt.topic_id IN ${filters.topicIds})`
    );
  }
  if (filters.tagIds?.length) {
    conds.push(
      sql`EXISTS (SELECT 1 FROM ${problemTags} pg WHERE pg.problem_id = ${problems.id} AND pg.tag_id IN ${filters.tagIds})`
    );
  }

  const whereClause = conds.length ? and(...conds) : undefined;

  const orderColumn =
    sort.field === "difficulty"
      ? problems.difficulty
      : sort.field === "year"
      ? problems.year
      : problems.createdAt;
  const orderBy = sort.direction === "asc" ? asc(orderColumn) : desc(orderColumn);

  // Count
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(problems)
    .where(whereClause);

  const total = countResult[0]?.count ?? 0;

  // Page
  const rows = await db
    .select({
      id: problems.id,
      bodyMd: problems.bodyMd,
      year: problems.year,
      problemNumber: problems.problemNumber,
      difficulty: problems.difficulty,
      createdAt: problems.createdAt,
      sourceName: sources.name,
    })
    .from(problems)
    .leftJoin(sources, eq(sources.id, problems.sourceId))
    .where(whereClause)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  if (rows.length === 0) {
    return { rows: [], total };
  }

  // Hydrate topic names + classes per row
  const ids = rows.map((r) => r.id);
  const [topicRows, classRows] = await Promise.all([
    db
      .select({
        problemId: problemTopics.problemId,
        topicName: topics.name,
      })
      .from(problemTopics)
      .innerJoin(topics, eq(topics.id, problemTopics.topicId))
      .where(inArray(problemTopics.problemId, ids)),
    db
      .select({
        problemId: problemClasses.problemId,
        classNumber: problemClasses.classNumber,
      })
      .from(problemClasses)
      .where(inArray(problemClasses.problemId, ids)),
  ]);

  const topicsByProblem = new Map<string, string[]>();
  for (const r of topicRows) {
    if (!topicsByProblem.has(r.problemId)) topicsByProblem.set(r.problemId, []);
    topicsByProblem.get(r.problemId)!.push(r.topicName);
  }
  const classesByProblem = new Map<string, number[]>();
  for (const r of classRows) {
    if (!classesByProblem.has(r.problemId))
      classesByProblem.set(r.problemId, []);
    classesByProblem.get(r.problemId)!.push(r.classNumber);
  }

  return {
    rows: rows.map((r) => ({
      id: r.id,
      bodyPreview: stripMarkdownToPreview(r.bodyMd, 140),
      sourceName: r.sourceName ?? "—",
      year: r.year,
      problemNumber: r.problemNumber,
      difficulty: r.difficulty,
      createdAt: r.createdAt,
      topicNames: topicsByProblem.get(r.id) ?? [],
      classes: (classesByProblem.get(r.id) ?? []).sort((a, b) => a - b),
    })),
    total,
  };
}

/**
 * Cheap markdown stripper for list previews. Removes math delimiters,
 * headings, links — keeps text readable in a small cell.
 */
function stripMarkdownToPreview(md: string, maxLen: number): string {
  const stripped = md
    .replace(/\$\$[\s\S]*?\$\$/g, "[math]")
    .replace(/\$[^$\n]+\$/g, "[math]")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "[image]")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length > maxLen
    ? stripped.slice(0, maxLen).trimEnd() + "…"
    : stripped;
}
```

### 6.2. URL state schema

Create `src/app/admin/problems/_url-state.ts`:

```typescript
import { z } from "zod";
import type { ProblemListFilters, ProblemListSort } from "@/lib/problems/queries";

const csv = (s: string | string[] | undefined) =>
  typeof s === "string" ? s.split(",").filter(Boolean) : (s ?? []);

const intCsv = (s: string | string[] | undefined) =>
  csv(s).map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n));

export function parseSearchParams(sp: URLSearchParams) {
  const filters: ProblemListFilters = {
    search: sp.get("q") || undefined,
    sourceIds: csv(sp.get("source") ?? undefined),
    yearFrom: sp.get("yearFrom") ? parseInt(sp.get("yearFrom")!) : undefined,
    yearTo: sp.get("yearTo") ? parseInt(sp.get("yearTo")!) : undefined,
    difficulties: intCsv(sp.get("difficulty") ?? undefined),
    classes: intCsv(sp.get("class") ?? undefined),
    topicIds: csv(sp.get("topic") ?? undefined),
    tagIds: csv(sp.get("tag") ?? undefined),
  };

  const sortField = sp.get("sortField");
  const sortDir = sp.get("sortDir");
  const sort: ProblemListSort = {
    field:
      sortField === "difficulty" || sortField === "year"
        ? sortField
        : "createdAt",
    direction: sortDir === "asc" ? "asc" : "desc",
  };

  const page = Math.max(1, parseInt(sp.get("page") || "1") || 1);
  const pageSize = 25;

  return { filters, sort, page, pageSize };
}
```

### 6.3. List page (server component)

Create `src/app/admin/problems/page.tsx`:

```tsx
import Link from "next/link";
import { db } from "@/db";
import { topics, sources, tags } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { listProblems } from "@/lib/problems/queries";
import { parseSearchParams } from "./_url-state";
import { ProblemFiltersSidebar } from "./filters-sidebar";
import { ProblemsTable } from "./problems-table";
import { Button } from "@/components/ui/button";

export default async function ProblemsListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach((x) => usp.append(k, x));
    else if (v !== undefined) usp.set(k, v);
  }
  const { filters, sort, page, pageSize } = parseSearchParams(usp);

  const [{ rows, total }, allTopics, allSources, allTags] = await Promise.all([
    listProblems(filters, sort, page, pageSize),
    db.select().from(topics).orderBy(topics.name),
    db.select().from(sources).orderBy(sources.name),
    db.select().from(tags).orderBy(tags.name),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Problems</h1>
          <p className="text-muted-foreground text-sm">
            {total.toLocaleString()} total
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/problems/new">+ New problem</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        <ProblemFiltersSidebar
          allTopics={allTopics}
          allSources={allSources}
          allTags={allTags}
          currentFilters={filters}
        />
        <ProblemsTable
          rows={rows}
          total={total}
          page={page}
          pageSize={pageSize}
          sort={sort}
        />
      </div>
    </div>
  );
}
```

### 6.4. Filters sidebar (client component)

Create `src/app/admin/problems/filters-sidebar.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { Topic, Source, Tag } from "@/db/schema";
import type { ProblemListFilters } from "@/lib/problems/queries";

export function ProblemFiltersSidebar({
  allTopics,
  allSources,
  allTags,
  currentFilters,
}: {
  allTopics: Topic[];
  allSources: Source[];
  allTags: Tag[];
  currentFilters: ProblemListFilters;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(currentFilters.search ?? "");

  function updateParam(
    key: string,
    value: string | string[] | undefined
  ) {
    const next = new URLSearchParams(params.toString());
    next.delete(key);
    next.delete("page"); // reset paging on filter change
    if (Array.isArray(value)) {
      if (value.length) next.set(key, value.join(","));
    } else if (value) {
      next.set(key, value);
    }
    startTransition(() => {
      router.push(`${pathname}?${next.toString()}`);
    });
  }

  function toggleInArray(key: string, value: string) {
    const current = (params.get(key) ?? "").split(",").filter(Boolean);
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    updateParam(key, next);
  }

  function clearAll() {
    startTransition(() => router.push(pathname));
  }

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateParam("q", searchInput || undefined);
  }

  return (
    <aside className="space-y-5 text-sm">
      <form onSubmit={onSearchSubmit} className="space-y-1">
        <Label htmlFor="q">Search</Label>
        <Input
          id="q"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="text in problem body…"
        />
      </form>

      <div className="space-y-1">
        <Label>Difficulty</Label>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((d) => {
            const active = currentFilters.difficulties?.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleInArray("difficulty", String(d))}
                className={`h-8 w-8 rounded border ${
                  active ? "bg-primary text-primary-foreground" : "bg-background"
                }`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1">
        <Label>Classes</Label>
        <div className="grid grid-cols-4 gap-2">
          {[5, 6, 7, 8, 9, 10, 11].map((c) => {
            const active = currentFilters.classes?.includes(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleInArray("class", String(c))}
                className={`h-8 rounded border text-xs ${
                  active ? "bg-primary text-primary-foreground" : "bg-background"
                }`}
              >
                {c}-sinf
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1">
        <Label>Source</Label>
        <div className="space-y-1 max-h-48 overflow-auto pr-1">
          {allSources.map((s) => {
            const active = currentFilters.sourceIds?.includes(s.id);
            return (
              <label key={s.id} className="flex items-center gap-2">
                <Checkbox
                  checked={!!active}
                  onCheckedChange={() => toggleInArray("source", s.id)}
                />
                <span>{s.name}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="space-y-1">
        <Label>Year</Label>
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="from"
            value={currentFilters.yearFrom ?? ""}
            onChange={(e) =>
              updateParam("yearFrom", e.target.value || undefined)
            }
          />
          <Input
            type="number"
            placeholder="to"
            value={currentFilters.yearTo ?? ""}
            onChange={(e) => updateParam("yearTo", e.target.value || undefined)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Topics</Label>
        <div className="space-y-1 max-h-48 overflow-auto pr-1">
          {allTopics.map((t) => {
            const active = currentFilters.topicIds?.includes(t.id);
            return (
              <label key={t.id} className="flex items-center gap-2">
                <Checkbox
                  checked={!!active}
                  onCheckedChange={() => toggleInArray("topic", t.id)}
                />
                <span>{t.name}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="space-y-1">
        <Label>Tags</Label>
        <div className="space-y-1 max-h-32 overflow-auto pr-1">
          {allTags.map((t) => {
            const active = currentFilters.tagIds?.includes(t.id);
            return (
              <label key={t.id} className="flex items-center gap-2">
                <Checkbox
                  checked={!!active}
                  onCheckedChange={() => toggleInArray("tag", t.id)}
                />
                <span>#{t.name}</span>
              </label>
            );
          })}
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={clearAll}
        disabled={isPending}
      >
        Clear filters
      </Button>
    </aside>
  );
}
```

### 6.5. Problems table (client component for selection)

Create `src/app/admin/problems/problems-table.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { bulkDeleteProblemsAction } from "./_actions";
import type { ProblemListResult, ProblemListSort } from "@/lib/problems/queries";

export function ProblemsTable({
  rows,
  total,
  page,
  pageSize,
  sort,
}: {
  rows: ProblemListResult["rows"];
  total: number;
  page: number;
  pageSize: number;
  sort: ProblemListSort;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function gotoPage(n: number) {
    const next = new URLSearchParams(params.toString());
    next.set("page", String(n));
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  }

  function changeSort(field: ProblemListSort["field"]) {
    const next = new URLSearchParams(params.toString());
    next.set("sortField", field);
    next.set(
      "sortDir",
      sort.field === field && sort.direction === "desc" ? "asc" : "desc"
    );
    next.delete("page");
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(rows.map((r) => r.id)) : new Set());
  }
  function toggleOne(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }

  async function bulkDelete() {
    await bulkDeleteProblemsAction(Array.from(selected));
    setSelected(new Set());
    setConfirmOpen(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {selected.size > 0 && `${selected.size} selected`}
        </div>
        {selected.size > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmOpen(true)}
          >
            Delete selected
          </Button>
        )}
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  checked={
                    selected.size > 0 && selected.size === rows.length
                  }
                  onCheckedChange={(v) => toggleAll(!!v)}
                />
              </TableHead>
              <TableHead>Problem</TableHead>
              <TableHead
                className="cursor-pointer"
                onClick={() => changeSort("year")}
              >
                Source / Year
              </TableHead>
              <TableHead
                className="cursor-pointer"
                onClick={() => changeSort("difficulty")}
              >
                Diff.
              </TableHead>
              <TableHead>Topics</TableHead>
              <TableHead>Classes</TableHead>
              <TableHead
                className="cursor-pointer"
                onClick={() => changeSort("createdAt")}
              >
                Created
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  No problems match the current filters.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(r.id)}
                    onCheckedChange={() => toggleOne(r.id)}
                  />
                </TableCell>
                <TableCell className="max-w-md">
                  <Link
                    href={`/admin/problems/${r.id}`}
                    className="hover:underline"
                  >
                    {r.bodyPreview || <em>(empty)</em>}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {r.sourceName} {r.year ?? ""}{" "}
                  {r.problemNumber && <span className="text-muted-foreground">#{r.problemNumber}</span>}
                </TableCell>
                <TableCell>{r.difficulty}/5</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {r.topicNames.slice(0, 2).map((t) => (
                      <Badge key={t} variant="secondary" className="text-xs">
                        {t}
                      </Badge>
                    ))}
                    {r.topicNames.length > 2 && (
                      <span className="text-xs text-muted-foreground">
                        +{r.topicNames.length - 2}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs">{r.classes.join(", ")}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">
                  {new Date(r.createdAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm">
        <span>Page {page} of {totalPages}</span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => gotoPage(page - 1)}
            disabled={page <= 1 || isPending}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => gotoPage(page + 1)}
            disabled={page >= totalPages || isPending}
          >
            Next
          </Button>
        </div>
      </div>

      {/* Confirm bulk delete dialog — left as exercise; reuse Dialog from shadcn */}
      {confirmOpen && (
        <ConfirmBulkDelete
          count={selected.size}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={bulkDelete}
        />
      )}
    </div>
  );
}

// Inline confirm component
function ConfirmBulkDelete({
  count,
  onCancel,
  onConfirm,
}: {
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Use shadcn Dialog here. Omitted for brevity; same pattern as
  // DeleteProblemButton in Phase 5.
  return null;
}
```

### 6.6. Bulk delete server action

Add to `src/app/admin/problems/_actions.ts`:

```typescript
import { inArray } from "drizzle-orm";

export async function bulkDeleteProblemsAction(ids: string[]) {
  await requireAdmin();
  if (!ids.length) return;
  await db.delete(problems).where(inArray(problems.id, ids));
  revalidatePath("/admin/problems");
}
```

(Add the necessary `import { db, problems }` at top of the actions file.)

### 6.7. Verify the FTS index is being used

In `psql`, run an `EXPLAIN ANALYZE` of the search query:

```sql
EXPLAIN ANALYZE
SELECT id FROM problems
WHERE to_tsvector('simple', body_md) @@ websearch_to_tsquery('simple', 'algebra');
```

The plan should show `Bitmap Index Scan on problems_body_fts_idx`. If it
shows a Seq Scan, the index expression doesn't match — double-check the
schema and re-generate the migration.

---

## File structure changes

```
src/
├── lib/
│   └── problems/
│       └── queries.ts                    (extended with listProblems)
└── app/
    └── admin/
        └── problems/
            ├── page.tsx                  (new — list page)
            ├── _url-state.ts             (new)
            ├── filters-sidebar.tsx       (new)
            ├── problems-table.tsx        (new)
            └── _actions.ts               (extended with bulkDelete)
```

---

## Acceptance criteria

- [ ] `/admin/problems` lists all seeded problems (after creating a few in
      Phase 5 testing)
- [ ] Typing in search and pressing Enter filters results
- [ ] Clicking a difficulty button toggles filtering by that difficulty
- [ ] Toggling source / topic / tag checkboxes filters and shows correct results
- [ ] Year range filtering works (try `from=2020 to=2024`)
- [ ] URL reflects all active filters (e.g. `?q=algebra&difficulty=4,5&class=10`)
- [ ] Refreshing the page or sharing the URL preserves filters
- [ ] Pagination shows correct total and page count, Next/Previous work
- [ ] Sorting by Difficulty / Year / Created toggles direction on each click
- [ ] Bulk delete: select multiple → button appears → confirm → rows are gone
- [ ] `EXPLAIN ANALYZE` confirms the FTS index is used for search queries
- [ ] With 1000+ problems (test by inserting via SQL), the list still loads <1s

---

## Common pitfalls

- **`websearch_to_tsquery` syntax** — Postgres parses `OR`, `-` (NOT),
  quoted phrases. If users enter weird input it won't error. If they type
  `:` it may behave unexpectedly. For MVP this is fine.
- **`useSearchParams` triggers Suspense boundary requirement** —
  `useSearchParams` in client components forces the page to bail out of
  static rendering. Acceptable here since admin pages are dynamic.
- **`startTransition` not awaiting router.push** — `router.push` triggers
  the navigation; `startTransition` lets React keep the old UI interactive
  during loading. Don't `await` the push.
- **Filters reset page to 1 silently** — verify by setting page=5, then
  changing a filter; you should land back on page 1.
- **Selection lost across pages** — selection state is per-component, so
  changing pages clears selection. This is intentional for MVP. Cross-page
  selection is a Phase 10 polish item if needed.
- **N+1 on topics fetch** — we batch with `inArray` after the main query;
  this is 2 queries per page render, not N+1. Don't loop and query per row.

---

## What's next

→ [Phase 7 — Bulk Import Format Spec](./phase-07-bulk-import-format-spec.md)
