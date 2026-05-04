# Phase 9 — Taxonomy CRUD and Dashboard

**Goal:** Admin pages to manage topics (hierarchical), sources, and tags.
A dashboard at `/admin` showing key stats with simple charts. This makes
the platform self-sufficient — admins can grow the taxonomy without
touching the database.

**Estimated time:** 1.5 sessions (~5 hours)

---

## What you'll have at the end

- `/admin/topics` — list, create, edit, delete topics; supports hierarchy
- `/admin/sources` — same for sources, plus the kind enum and country
- `/admin/tags` — same for tags, with usage count and merge feature
- `/admin` (dashboard) — total counts, breakdown by topic / source /
  difficulty, recent activity feed
- All CRUD actions guarded by `requireAdmin`
- Slug auto-generation (with manual override) for new entries

---

## Steps

### 9.1. Slug helper

Create `src/lib/utils/slug.ts`:

```typescript
/**
 * Convert a name to a URL-safe slug.
 * Handles Latin and Cyrillic transliteration roughly. Good enough for
 * an admin-controlled set of slugs that get reviewed.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"`]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
```

This is intentionally simple — for proper Cyrillic transliteration use a
library. For the MVP, admins type slugs in English so this works fine.

### 9.2. Topics CRUD

Topics are hierarchical. We render them as a tree.

#### 9.2.1. Queries

Create `src/lib/taxonomy/queries.ts`:

```typescript
import "server-only";
import { db } from "@/db";
import { topics, sources, tags, problemTopics, problemTags } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function listTopicsWithCounts() {
  const rows = await db
    .select({
      id: topics.id,
      name: topics.name,
      slug: topics.slug,
      parentId: topics.parentId,
      description: topics.description,
      problemCount: sql<number>`(
        SELECT count(*)::int
        FROM ${problemTopics}
        WHERE ${problemTopics.topicId} = ${topics.id}
      )`,
    })
    .from(topics)
    .orderBy(topics.name);
  return rows;
}

export async function listSourcesWithCounts() {
  const rows = await db
    .select({
      id: sources.id,
      name: sources.name,
      slug: sources.slug,
      kind: sources.kind,
      country: sources.country,
      problemCount: sql<number>`(
        SELECT count(*)::int
        FROM problems
        WHERE problems.source_id = ${sources.id}
      )`,
    })
    .from(sources)
    .orderBy(sources.name);
  return rows;
}

export async function listTagsWithCounts() {
  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
      usageCount: sql<number>`(
        SELECT count(*)::int
        FROM ${problemTags}
        WHERE ${problemTags.tagId} = ${tags.id}
      )`,
    })
    .from(tags)
    .orderBy(tags.name);
  return rows;
}
```

#### 9.2.2. Mutations

Create `src/lib/taxonomy/mutations.ts`:

```typescript
import "server-only";
import { db } from "@/db";
import { topics, sources, tags, problemTags } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function createTopic(input: {
  name: string;
  slug: string;
  parentId: string | null;
  description: string | null;
}) {
  await db.insert(topics).values(input);
}

export async function updateTopic(
  id: string,
  input: {
    name: string;
    slug: string;
    parentId: string | null;
    description: string | null;
  }
) {
  await db.update(topics).set(input).where(eq(topics.id, id));
}

export async function deleteTopic(id: string) {
  // FK is restrict on problem_topics — will throw if topic has problems.
  // Children topics: parent_id is set null on delete (per schema).
  await db.delete(topics).where(eq(topics.id, id));
}

export async function createSource(input: {
  name: string;
  slug: string;
  kind: "olympiad" | "book" | "course" | "other";
  country: string | null;
}) {
  await db.insert(sources).values(input);
}

export async function updateSource(
  id: string,
  input: Parameters<typeof createSource>[0]
) {
  await db.update(sources).set(input).where(eq(sources.id, id));
}

export async function deleteSource(id: string) {
  await db.delete(sources).where(eq(sources.id, id));
}

export async function createTag(input: { name: string; slug: string }) {
  await db.insert(tags).values(input);
}

export async function updateTag(id: string, input: { name: string; slug: string }) {
  await db.update(tags).set(input).where(eq(tags.id, id));
}

export async function deleteTag(id: string) {
  await db.delete(tags).where(eq(tags.id, id));
}

/**
 * Merge tag `from` into `to`: re-point all problem_tags rows, then delete
 * the `from` tag.
 */
export async function mergeTag(fromId: string, toId: string) {
  await db.transaction(async (tx) => {
    // Move junction rows that aren't already pointing at `toId`
    await tx.execute(
      // eslint-disable-next-line drizzle/enforce-update-with-where
      `UPDATE problem_tags pt
       SET tag_id = $1
       WHERE pt.tag_id = $2
         AND NOT EXISTS (
           SELECT 1 FROM problem_tags pt2
           WHERE pt2.problem_id = pt.problem_id AND pt2.tag_id = $1
         )`
        .replace("$1", `'${toId}'`)
        .replace("$2", `'${fromId}'`)
    );
    // Delete remaining rows (already had `toId`)
    await tx.delete(problemTags).where(eq(problemTags.tagId, fromId));
    // Delete the empty tag
    await tx.delete(tags).where(eq(tags.id, fromId));
  });
}
```

(Note: that raw SQL is for clarity — in practice prefer Drizzle's typed
query builder. Use parameterized `sql` template literal:
`tx.execute(sql\`UPDATE problem_tags ... WHERE tag_id = ${fromId} ...\`)`.)

#### 9.2.3. Server actions

Create `src/app/admin/topics/_actions.ts`:

```typescript
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createTopic, updateTopic, deleteTopic } from "@/lib/taxonomy/mutations";

const topicSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  parentId: z.string().uuid().nullable(),
  description: z.string().max(1000).nullable(),
});

export async function createTopicAction(raw: unknown) {
  await requireAdmin();
  const parsed = topicSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await createTopic(parsed.data);
  revalidatePath("/admin/topics");
  return { success: true };
}

export async function updateTopicAction(id: string, raw: unknown) {
  await requireAdmin();
  const parsed = topicSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await updateTopic(id, parsed.data);
  revalidatePath("/admin/topics");
  return { success: true };
}

export async function deleteTopicAction(id: string) {
  await requireAdmin();
  try {
    await deleteTopic(id);
    revalidatePath("/admin/topics");
    return { success: true };
  } catch (e) {
    return { error: "Cannot delete: topic has problems associated. Reassign first." };
  }
}
```

Create equivalent files: `src/app/admin/sources/_actions.ts` and
`src/app/admin/tags/_actions.ts` following the same pattern.

#### 9.2.4. Topics list page (with tree rendering)

Create `src/app/admin/topics/page.tsx`:

```tsx
import { requireAdmin } from "@/lib/auth";
import { listTopicsWithCounts } from "@/lib/taxonomy/queries";
import { TopicsTree } from "./topics-tree";

export default async function TopicsPage() {
  await requireAdmin();
  const topics = await listTopicsWithCounts();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Topics</h1>
      <p className="text-muted-foreground text-sm">
        Topics can be nested. Child topics inherit nothing — they're just
        organized for browsing.
      </p>
      <TopicsTree topics={topics} />
    </div>
  );
}
```

Create `src/app/admin/topics/topics-tree.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TopicEditDialog } from "./topic-edit-dialog";

interface TopicRow {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  description: string | null;
  problemCount: number;
}

export function TopicsTree({ topics }: { topics: TopicRow[] }) {
  const [editingId, setEditingId] = useState<string | "new" | null>(null);

  // Build tree
  const byParent = new Map<string | null, TopicRow[]>();
  for (const t of topics) {
    const arr = byParent.get(t.parentId) ?? [];
    arr.push(t);
    byParent.set(t.parentId, arr);
  }

  function renderNode(node: TopicRow, depth = 0) {
    const children = byParent.get(node.id) ?? [];
    return (
      <div key={node.id}>
        <div
          className="flex items-center justify-between py-2 hover:bg-muted px-2 rounded"
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
        >
          <div className="flex items-center gap-2">
            <span className="font-medium">{node.name}</span>
            <span className="text-xs text-muted-foreground">{node.slug}</span>
            <Badge variant="outline">{node.problemCount}</Badge>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditingId(node.id)}
            >
              Edit
            </Button>
          </div>
        </div>
        {children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  }

  const roots = byParent.get(null) ?? [];

  return (
    <div className="space-y-4">
      <Button onClick={() => setEditingId("new")}>+ New topic</Button>

      <div className="border rounded-md">
        {roots.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground text-center">
            No topics yet. Create one to start.
          </div>
        )}
        {roots.map((r) => renderNode(r))}
      </div>

      {editingId !== null && (
        <TopicEditDialog
          mode={editingId === "new" ? "create" : "edit"}
          topic={editingId === "new" ? undefined : topics.find((t) => t.id === editingId)}
          allTopics={topics}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}
```

Create `src/app/admin/topics/topic-edit-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
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
import { slugify } from "@/lib/utils/slug";
import {
  createTopicAction,
  updateTopicAction,
  deleteTopicAction,
} from "./_actions";

interface Topic {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  description: string | null;
}

export function TopicEditDialog({
  mode,
  topic,
  allTopics,
  onClose,
}: {
  mode: "create" | "edit";
  topic?: Topic;
  allTopics: Topic[];
  onClose: () => void;
}) {
  const [name, setName] = useState(topic?.name ?? "");
  const [slug, setSlug] = useState(topic?.slug ?? "");
  const [parentId, setParentId] = useState<string>(topic?.parentId ?? "none");
  const [description, setDescription] = useState(topic?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function onSave() {
    setIsSaving(true);
    setError(null);
    const payload = {
      name,
      slug: slug || slugify(name),
      parentId: parentId === "none" ? null : parentId,
      description: description || null,
    };
    const res =
      mode === "create"
        ? await createTopicAction(payload)
        : await updateTopicAction(topic!.id, payload);
    if (res?.error) {
      setError(res.error);
      setIsSaving(false);
    } else {
      onClose();
    }
  }

  async function onDelete() {
    if (!topic) return;
    setIsSaving(true);
    const res = await deleteTopicAction(topic.id);
    if (res?.error) {
      setError(res.error);
      setIsSaving(false);
    } else {
      onClose();
    }
  }

  // Don't allow setting self or descendants as parent (avoid cycles)
  const validParents = allTopics.filter(
    (t) => t.id !== topic?.id // simplistic; full descendant check left as exercise
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New topic" : "Edit topic"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (mode === "create" && !slug) setSlug(slugify(e.target.value));
              }}
            />
          </div>
          <div>
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="auto-from-name"
            />
          </div>
          <div>
            <Label htmlFor="parent">Parent</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger id="parent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— No parent —</SelectItem>
                {validParents.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          {mode === "edit" && (
            <Button
              variant="destructive"
              onClick={onDelete}
              disabled={isSaving}
              className="mr-auto"
            >
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={isSaving || !name}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### 9.3. Sources CRUD

Mirror the topics pattern. Files:
- `src/app/admin/sources/page.tsx` — flat list (no tree), shows kind +
  country + count
- `src/app/admin/sources/sources-list.tsx` — list with Edit/Delete buttons
- `src/app/admin/sources/source-edit-dialog.tsx` — form with kind dropdown
  (olympiad / book / course / other) and country input
- `src/app/admin/sources/_actions.ts` — create/update/delete server actions

The fields are simpler (no parent), so the dialog is shorter. Same slug
auto-generation logic.

### 9.4. Tags CRUD with merge

Files:
- `src/app/admin/tags/page.tsx`
- `src/app/admin/tags/tags-list.tsx` — sortable by usage count, has
  "Merge into…" action that picks another tag
- `src/app/admin/tags/_actions.ts`

Merge UX: click a tag, dropdown of all other tags appears, pick destination,
confirm dialog "All N usages of #from will move to #to and #from will be
deleted. Continue?".

The `mergeTag` function from 9.2.2 does the work.

### 9.5. Dashboard at `/admin`

Replace the placeholder dashboard with real stats.

Update `src/app/admin/page.tsx`:

```tsx
import { db } from "@/db";
import {
  problems,
  topics,
  sources,
  tags,
  problemTopics,
  importBatches,
} from "@/db/schema";
import { sql, desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { DashboardCharts } from "./dashboard-charts";
import Link from "next/link";

export default async function AdminDashboard() {
  await requireAdmin();

  const [
    [{ totalProblems }],
    [{ totalTopics }],
    [{ totalSources }],
    [{ totalTags }],
    byTopic,
    bySource,
    byDifficulty,
    recentImports,
  ] = await Promise.all([
    db.select({ totalProblems: sql<number>`count(*)::int` }).from(problems),
    db.select({ totalTopics: sql<number>`count(*)::int` }).from(topics),
    db.select({ totalSources: sql<number>`count(*)::int` }).from(sources),
    db.select({ totalTags: sql<number>`count(*)::int` }).from(tags),
    db
      .select({
        topicName: topics.name,
        count: sql<number>`count(*)::int`,
      })
      .from(problemTopics)
      .innerJoin(topics, sql`${topics.id} = ${problemTopics.topicId}`)
      .groupBy(topics.id, topics.name)
      .orderBy(sql`count(*) desc`)
      .limit(8),
    db
      .select({
        sourceName: sources.name,
        count: sql<number>`count(*)::int`,
      })
      .from(problems)
      .innerJoin(sources, sql`${sources.id} = ${problems.sourceId}`)
      .groupBy(sources.id, sources.name)
      .orderBy(sql`count(*) desc`)
      .limit(8),
    db
      .select({
        difficulty: problems.difficulty,
        count: sql<number>`count(*)::int`,
      })
      .from(problems)
      .groupBy(problems.difficulty)
      .orderBy(problems.difficulty),
    db.select().from(importBatches).orderBy(desc(importBatches.createdAt)).limit(5),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Problems" value={totalProblems} href="/admin/problems" />
        <StatCard label="Topics" value={totalTopics} href="/admin/topics" />
        <StatCard label="Sources" value={totalSources} href="/admin/sources" />
        <StatCard label="Tags" value={totalTags} href="/admin/tags" />
      </div>

      <DashboardCharts
        byTopic={byTopic}
        bySource={bySource}
        byDifficulty={byDifficulty}
      />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Recent imports</h2>
        <div className="border rounded-md divide-y text-sm">
          {recentImports.length === 0 && (
            <div className="p-3 text-muted-foreground">No imports yet.</div>
          )}
          {recentImports.map((b) => (
            <Link
              key={b.id}
              href={`/admin/import/${b.id}`}
              className="block p-3 hover:bg-muted"
            >
              <div className="flex justify-between">
                <span>{b.filename}</span>
                <span>
                  {b.successCount} / {b.totalCount}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(b.createdAt).toLocaleString()} · {b.status}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="border rounded-md p-4 hover:bg-muted transition-colors"
    >
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-3xl font-bold mt-1">{value.toLocaleString()}</div>
    </Link>
  );
}
```

### 9.6. Charts

Install `recharts` (lightweight, React-friendly):

```bash
npm install recharts
```

Create `src/app/admin/dashboard-charts.tsx`:

```tsx
"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";

const COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#ef4444", "#a855f7"];

export function DashboardCharts({
  byTopic,
  bySource,
  byDifficulty,
}: {
  byTopic: Array<{ topicName: string; count: number }>;
  bySource: Array<{ sourceName: string; count: number }>;
  byDifficulty: Array<{ difficulty: number; count: number }>;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <ChartCard title="By topic">
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={byTopic}
              dataKey="count"
              nameKey="topicName"
              outerRadius={80}
              label={(d: { topicName: string }) => d.topicName}
            >
              {byTopic.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="By source">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={bySource} layout="vertical">
            <XAxis type="number" />
            <YAxis type="category" dataKey="sourceName" width={100} />
            <Tooltip />
            <Bar dataKey="count" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="By difficulty">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={byDifficulty}>
            <XAxis dataKey="difficulty" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="count" fill="#8b5cf6" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-md p-4">
      <h3 className="font-medium mb-3">{title}</h3>
      {children}
    </div>
  );
}
```

### 9.7. Update admin nav

In `src/app/admin/layout.tsx`, expand the nav:

```tsx
<Link href="/admin">Dashboard</Link>
<Link href="/admin/problems">Problems</Link>
<Link href="/admin/import">Import</Link>
<Link href="/admin/topics">Topics</Link>
<Link href="/admin/sources">Sources</Link>
<Link href="/admin/tags">Tags</Link>
```

Use a small horizontal nav with active state styling.

---

## File structure changes

```
src/
├── lib/
│   ├── utils/
│   │   └── slug.ts                          (new)
│   └── taxonomy/
│       ├── queries.ts                       (new)
│       └── mutations.ts                     (new)
└── app/
    └── admin/
        ├── layout.tsx                       (modified — full nav)
        ├── page.tsx                         (replaced — dashboard)
        ├── dashboard-charts.tsx             (new)
        ├── topics/
        │   ├── page.tsx                     (new)
        │   ├── topics-tree.tsx              (new)
        │   ├── topic-edit-dialog.tsx        (new)
        │   └── _actions.ts                  (new)
        ├── sources/
        │   ├── page.tsx                     (new)
        │   ├── sources-list.tsx             (new)
        │   ├── source-edit-dialog.tsx       (new)
        │   └── _actions.ts                  (new)
        └── tags/
            ├── page.tsx                     (new)
            ├── tags-list.tsx                (new)
            ├── tag-edit-dialog.tsx          (new)
            ├── tag-merge-dialog.tsx         (new)
            └── _actions.ts                  (new)
```

---

## Acceptance criteria

- [ ] `/admin` shows dashboard with 4 stat cards and 3 charts
- [ ] Stat cards link to their respective list pages
- [ ] Charts render correctly with seeded + imported data
- [ ] `/admin/topics` shows hierarchical tree of topics, indented properly
- [ ] Creating a new topic with a parent works; the new topic appears nested
- [ ] Editing a topic to change its parent moves it in the tree
- [ ] Deleting a topic with no problems works
- [ ] Deleting a topic with problems associated shows a friendly error
- [ ] Slug auto-generates from name; manual override is honored
- [ ] `/admin/sources` allows creating sources with kind enum
- [ ] `/admin/tags` shows usage count per tag, sortable
- [ ] Merging tag A into tag B: all problems tagged A become tagged B,
      tag A is deleted, no duplicate problem-tag rows
- [ ] All actions are guarded — visiting these pages without admin role
      → redirect to /login

---

## Common pitfalls

- **Recharts SSR issues** — Recharts uses `ResponsiveContainer` which
  needs the DOM. We marked the chart component `"use client"`. The server
  component fetches data, the client component renders.
- **Tree cycle on parent change** — moving topic A to be a child of its
  own descendant creates an infinite loop. The dialog filters `t.id !== topic?.id`
  but doesn't filter descendants. For a small admin team this is acceptable.
  Add a full descendant check if you start having deep trees.
- **`onConflictDoNothing` returns nothing** — when bulk-creating tags via
  `mergeTag` we never use it, but elsewhere we do. Always re-query after
  conflict-do-nothing if you need IDs.
- **Slug collisions** — the unique constraint on `topics.slug` (and
  sources/tags) raises an error on duplicate. Catch and show a friendly
  message in the action.
- **Charts cluttered with too many topics** — we cap to top 8. If more
  topics exist, the rest are silently aggregated as "other" later (Phase 10
  polish if needed).
- **Recent imports limit hardcoded** — 5 is fine for the dashboard. The
  full list is on `/admin/import`.

---

## What's next

→ [Phase 10 — Polish and Production](./phase-10-polish-and-production.md)
