# Phase 5 — Single Problem CRUD

**Goal:** Admin can create, edit, view, and delete a single problem through a
polished UI: split-view markdown editor with live KaTeX preview, metadata
form (source / year / topics / tags / classes / difficulty), and drag-drop
image upload that inserts the markdown reference into the editor.

**Estimated time:** 2 sessions (~6 hours)

---

## What you'll have at the end

- `/admin/problems/new` — full create UI
- `/admin/problems/[id]` — view problem
- `/admin/problems/[id]/edit` — edit (same form as create)
- Server actions: `createProblem`, `updateProblem`, `deleteProblem`
- `<MarkdownEditor>` component (CodeMirror 6, drag-drop image upload)
- `<MetadataForm>` component (combobox-style multi-selects for taxonomy)
- Transactional writes — problem + topic/tag/class associations created together

---

## Steps

### 5.1. Install editor and form deps

```bash
npm install @uiw/react-codemirror @codemirror/lang-markdown \
  @codemirror/theme-one-dark react-hook-form @hookform/resolvers
```

`react-hook-form` for form state; `zod` (already installed) for validation.

shadcn additions:

```bash
npx shadcn@latest add command popover checkbox
```

### 5.2. Server queries / mutations layer

We organize all DB operations for problems in one place so the UI doesn't
sprinkle Drizzle calls everywhere.

Create `src/lib/problems/queries.ts`:

```typescript
import "server-only";
import { db } from "@/db";
import {
  problems,
  problemTopics,
  problemTags,
  problemClasses,
  images,
  topics,
  sources,
  tags,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

export async function getProblemById(id: string) {
  const problem = await db.query.problems.findFirst({
    where: eq(problems.id, id),
  });
  if (!problem) return null;

  const [topicRows, tagRows, classRows, source, imageRows] = await Promise.all([
    db
      .select({ id: topics.id, name: topics.name, slug: topics.slug })
      .from(problemTopics)
      .innerJoin(topics, eq(topics.id, problemTopics.topicId))
      .where(eq(problemTopics.problemId, id)),
    db
      .select({ id: tags.id, name: tags.name, slug: tags.slug })
      .from(problemTags)
      .innerJoin(tags, eq(tags.id, problemTags.tagId))
      .where(eq(problemTags.problemId, id)),
    db
      .select({ classNumber: problemClasses.classNumber })
      .from(problemClasses)
      .where(eq(problemClasses.problemId, id)),
    db.query.sources.findFirst({ where: eq(sources.id, problem.sourceId) }),
    db.query.images.findMany({ where: eq(images.problemId, id) }),
  ]);

  return {
    ...problem,
    topics: topicRows,
    tags: tagRows,
    classes: classRows.map((r) => r.classNumber),
    source,
    images: imageRows,
  };
}

export type ProblemWithRelations = NonNullable<
  Awaited<ReturnType<typeof getProblemById>>
>;
```

Create `src/lib/problems/mutations.ts`:

```typescript
import "server-only";
import { db } from "@/db";
import {
  problems,
  problemTopics,
  problemTags,
  problemClasses,
  tags,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";

export interface ProblemInput {
  bodyMd: string;
  solutionMd: string | null;
  answer: string | null;
  sourceId: string;
  year: number | null;
  problemNumber: string | null;
  difficulty: number;
  topicIds: string[];
  classes: number[];
  tagIds: string[];
  metadata?: Record<string, unknown>;
}

export async function createProblemTx(input: ProblemInput, createdBy: string) {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(problems)
      .values({
        bodyMd: input.bodyMd,
        solutionMd: input.solutionMd,
        answer: input.answer,
        sourceId: input.sourceId,
        year: input.year,
        problemNumber: input.problemNumber,
        difficulty: input.difficulty,
        createdBy,
        metadata: input.metadata ?? {},
      })
      .returning({ id: problems.id });

    if (input.topicIds.length) {
      await tx.insert(problemTopics).values(
        input.topicIds.map((topicId) => ({
          problemId: created.id,
          topicId,
        }))
      );
    }
    if (input.classes.length) {
      await tx.insert(problemClasses).values(
        input.classes.map((classNumber) => ({
          problemId: created.id,
          classNumber,
        }))
      );
    }
    if (input.tagIds.length) {
      await tx.insert(problemTags).values(
        input.tagIds.map((tagId) => ({ problemId: created.id, tagId }))
      );
    }

    return created.id;
  });
}

export async function updateProblemTx(
  id: string,
  input: ProblemInput
) {
  return db.transaction(async (tx) => {
    await tx
      .update(problems)
      .set({
        bodyMd: input.bodyMd,
        solutionMd: input.solutionMd,
        answer: input.answer,
        sourceId: input.sourceId,
        year: input.year,
        problemNumber: input.problemNumber,
        difficulty: input.difficulty,
        metadata: input.metadata ?? {},
        updatedAt: new Date(),
      })
      .where(eq(problems.id, id));

    // Replace junction rows (simpler than diffing for MVP)
    await tx.delete(problemTopics).where(eq(problemTopics.problemId, id));
    await tx.delete(problemTags).where(eq(problemTags.problemId, id));
    await tx.delete(problemClasses).where(eq(problemClasses.problemId, id));

    if (input.topicIds.length) {
      await tx.insert(problemTopics).values(
        input.topicIds.map((topicId) => ({ problemId: id, topicId }))
      );
    }
    if (input.classes.length) {
      await tx.insert(problemClasses).values(
        input.classes.map((classNumber) => ({ problemId: id, classNumber }))
      );
    }
    if (input.tagIds.length) {
      await tx.insert(problemTags).values(
        input.tagIds.map((tagId) => ({ problemId: id, tagId }))
      );
    }
  });
}

export async function deleteProblemTx(id: string) {
  // Junction rows + images are cascaded by FK constraints
  await db.delete(problems).where(eq(problems.id, id));
}

/**
 * Find or create tags by name. Used when a user types a tag that doesn't
 * exist yet. Returns tag IDs in the original order.
 */
export async function ensureTagsByName(names: string[]): Promise<string[]> {
  if (!names.length) return [];
  const slugs = names.map((n) => n.trim().toLowerCase().replace(/\s+/g, "-"));
  const uniqueSlugs = Array.from(new Set(slugs));

  // Bulk insert; ignore duplicates
  await db
    .insert(tags)
    .values(
      uniqueSlugs.map((slug, i) => ({
        name: names[slugs.indexOf(slug)].trim(),
        slug,
      }))
    )
    .onConflictDoNothing({ target: tags.slug });

  // Read back the IDs
  const rows = await db
    .select({ id: tags.id, slug: tags.slug })
    .from(tags)
    .where(inArrayHelper(uniqueSlugs));

  const bySlug = new Map(rows.map((r) => [r.slug, r.id]));
  return slugs.map((s) => bySlug.get(s)).filter((x): x is string => !!x);
}

import { inArray } from "drizzle-orm";
function inArrayHelper(slugs: string[]) {
  return inArray(tags.slug, slugs);
}
```

### 5.3. Server actions

Create `src/app/admin/problems/_actions.ts`:

```typescript
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import {
  createProblemTx,
  updateProblemTx,
  deleteProblemTx,
  ensureTagsByName,
  type ProblemInput,
} from "@/lib/problems/mutations";

const problemSchema = z.object({
  bodyMd: z.string().min(1, "Problem body is required"),
  solutionMd: z.string().nullable().default(null),
  answer: z.string().nullable().default(null),
  sourceId: z.string().uuid(),
  year: z.number().int().min(1900).max(2100).nullable(),
  problemNumber: z.string().max(50).nullable(),
  difficulty: z.number().int().min(1).max(5),
  topicIds: z.array(z.string().uuid()).min(1, "Pick at least one topic"),
  classes: z.array(z.number().int().min(5).max(11)).min(1, "Pick at least one class"),
  tagNames: z.array(z.string().min(1).max(50)).default([]),
});

export async function createProblemAction(raw: unknown) {
  const user = await requireAdmin();
  const parsed = problemSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const tagIds = await ensureTagsByName(parsed.data.tagNames);

  const input: ProblemInput = { ...parsed.data, tagIds };
  const id = await createProblemTx(input, user.id);

  revalidatePath("/admin/problems");
  redirect(`/admin/problems/${id}`);
}

export async function updateProblemAction(id: string, raw: unknown) {
  await requireAdmin();
  const parsed = problemSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const tagIds = await ensureTagsByName(parsed.data.tagNames);
  const input: ProblemInput = { ...parsed.data, tagIds };
  await updateProblemTx(id, input);

  revalidatePath("/admin/problems");
  revalidatePath(`/admin/problems/${id}`);
  redirect(`/admin/problems/${id}`);
}

export async function deleteProblemAction(id: string) {
  await requireAdmin();
  await deleteProblemTx(id);
  revalidatePath("/admin/problems");
  redirect("/admin/problems");
}
```

### 5.4. Image upload server action (problem-scoped)

Update `src/app/admin/_actions/upload-image.ts` to also persist an `images`
row. We allow uploading without a problem ID (for the `new` page) — the row
gets created and associated later if the problem saves.

For MVP simplicity, store images **without** an `images` table row at upload
time; only insert into `images` table when the problem is saved. The
markdown body just contains the public URL.

(Optional refinement: track orphans for cleanup. Out of scope.)

### 5.5. `<MarkdownEditor>` component

Create `src/components/markdown-editor.tsx`:

```tsx
"use client";

import { useCallback } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { uploadImageAction } from "@/app/admin/_actions/upload-image";

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  uploadPrefix: string; // e.g. "problems/draft" or "problems/{id}"
  minHeight?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  uploadPrefix,
  minHeight = "500px",
}: MarkdownEditorProps) {
  const handleDrop = useCallback(
    async (event: DragEvent, view: EditorView) => {
      event.preventDefault();
      const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
        f.type.startsWith("image/")
      );
      if (!files.length) return;

      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("prefix", uploadPrefix);
        const result = await uploadImageAction(formData);
        if ("publicUrl" in result && result.publicUrl) {
          const insert = `\n![${file.name}](${result.publicUrl})\n`;
          const pos = view.state.selection.main.head;
          view.dispatch({
            changes: { from: pos, insert },
            selection: { anchor: pos + insert.length },
          });
        }
      }
    },
    [uploadPrefix]
  );

  const dropExtension = EditorView.domEventHandlers({
    drop: handleDrop as (event: Event, view: EditorView) => boolean | void,
    dragover: (e) => {
      e.preventDefault();
    },
  });

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={[
        markdown({ base: markdownLanguage }),
        EditorView.lineWrapping,
        dropExtension,
      ]}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
      }}
      height="auto"
      minHeight={minHeight}
      style={{ fontSize: "14px" }}
    />
  );
}
```

### 5.6. `<MetadataForm>` and combobox helpers

Create `src/components/metadata-form.tsx` — this is a long but mostly
mechanical component. Key parts:

- **Source** — `Select` with all sources, "Create new" link → opens a small
  inline create form (or a separate modal — for MVP just a link to
  `/admin/sources` page that we'll build in Phase 9; initially the seed gives
  enough sources).
- **Year** — `Input type="number"`, optional.
- **Problem number** — `Input type="text"`, optional.
- **Difficulty** — radio buttons 1-5 with labels (Oson, Yengil, O'rta, Qiyin, Juda qiyin).
- **Classes** — Checkboxes for 5-11.
- **Topics** — multi-select with hierarchical display (use Command from shadcn,
  show indented children). Multiple selection.
- **Tags** — text input that turns into chips on Enter or comma. Free-form,
  unknown tags get created.

I'll show the structure here; full code is in the implementation step.

```tsx
"use client";

import { Controller, useFormContext } from "react-hook-form";
import type { Topic, Source } from "@/db/schema";
// Imports for shadcn Select, Checkbox, Input, Label, Command...

interface MetadataFormProps {
  topicsAvailable: Topic[];
  sourcesAvailable: Source[];
  initialTags?: string[];
}

export function MetadataForm({
  topicsAvailable,
  sourcesAvailable,
  initialTags = [],
}: MetadataFormProps) {
  const { register, control, formState } = useFormContext();
  // ... render Select for source, Input for year & number,
  //     radio for difficulty, checkboxes for classes,
  //     multi-combobox for topics, tag input for tags
  return null; // placeholder — implementation written during the build
}
```

Render hint: keep this in a 2-column grid on `lg:` and stacked on smaller
screens. Errors from `formState.errors` shown under each field.

### 5.7. The composite `<ProblemForm>`

Create `src/components/problem-form.tsx`:

```tsx
"use client";

import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { MarkdownEditor } from "./markdown-editor";
import { MarkdownPreview } from "./markdown-preview";
import { MetadataForm } from "./metadata-form";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { Topic, Source } from "@/db/schema";
import {
  createProblemAction,
  updateProblemAction,
} from "@/app/admin/problems/_actions";

const formSchema = z.object({
  bodyMd: z.string().min(1, "Required"),
  solutionMd: z.string().nullable(),
  answer: z.string().nullable(),
  sourceId: z.string().uuid(),
  year: z.number().int().nullable(),
  problemNumber: z.string().nullable(),
  difficulty: z.number().int().min(1).max(5),
  topicIds: z.array(z.string()).min(1),
  classes: z.array(z.number()).min(1),
  tagNames: z.array(z.string()),
});

type FormValues = z.infer<typeof formSchema>;

export function ProblemForm({
  mode,
  problemId,
  defaultValues,
  topicsAvailable,
  sourcesAvailable,
  uploadPrefix,
}: {
  mode: "create" | "edit";
  problemId?: string;
  defaultValues: FormValues;
  topicsAvailable: Topic[];
  sourcesAvailable: Source[];
  uploadPrefix: string;
}) {
  const methods = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(values: FormValues) {
    setIsSaving(true);
    setError(null);
    try {
      const result =
        mode === "create"
          ? await createProblemAction(values)
          : await updateProblemAction(problemId!, values);
      if (result && "error" in result) setError(result.error ?? "Save failed");
    } finally {
      setIsSaving(false);
    }
  }

  const bodyMd = methods.watch("bodyMd");
  const solutionMd = methods.watch("solutionMd") ?? "";

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit(onSubmit)} className="space-y-6">
        <Tabs defaultValue="problem">
          <TabsList>
            <TabsTrigger value="problem">Problem (Shart)</TabsTrigger>
            <TabsTrigger value="solution">Solution (Yechim)</TabsTrigger>
          </TabsList>

          <TabsContent value="problem">
            <SplitView
              source={bodyMd}
              onChange={(v) => methods.setValue("bodyMd", v)}
              uploadPrefix={uploadPrefix}
            />
          </TabsContent>

          <TabsContent value="solution">
            <SplitView
              source={solutionMd}
              onChange={(v) => methods.setValue("solutionMd", v)}
              uploadPrefix={uploadPrefix}
            />
          </TabsContent>
        </Tabs>

        <div className="border-t pt-6">
          <h2 className="text-lg font-semibold mb-4">Metadata</h2>
          <MetadataForm
            topicsAvailable={topicsAvailable}
            sourcesAvailable={sourcesAvailable}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : mode === "create" ? "Create" : "Save changes"}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}

function SplitView({
  source,
  onChange,
  uploadPrefix,
}: {
  source: string;
  onChange: (v: string) => void;
  uploadPrefix: string;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div className="border rounded-md overflow-hidden">
        <MarkdownEditor
          value={source}
          onChange={onChange}
          uploadPrefix={uploadPrefix}
        />
      </div>
      <div className="border rounded-md p-4 min-h-[500px] overflow-auto">
        <MarkdownPreview source={source || "*Empty*"} />
      </div>
    </div>
  );
}
```

Add the Tabs shadcn component:

```bash
npx shadcn@latest add tabs
```

### 5.8. Pages

Create `src/app/admin/problems/new/page.tsx`:

```tsx
import { db } from "@/db";
import { topics, sources } from "@/db/schema";
import { ProblemForm } from "@/components/problem-form";
import { requireAdmin } from "@/lib/auth";

export default async function NewProblemPage() {
  await requireAdmin();
  const [topicsAvailable, sourcesAvailable] = await Promise.all([
    db.select().from(topics).orderBy(topics.name),
    db.select().from(sources).orderBy(sources.name),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">New problem</h1>
      <ProblemForm
        mode="create"
        defaultValues={{
          bodyMd: "",
          solutionMd: null,
          answer: null,
          sourceId: sourcesAvailable[0]?.id ?? "",
          year: null,
          problemNumber: null,
          difficulty: 3,
          topicIds: [],
          classes: [],
          tagNames: [],
        }}
        topicsAvailable={topicsAvailable}
        sourcesAvailable={sourcesAvailable}
        uploadPrefix="problems/draft"
      />
    </div>
  );
}
```

Create `src/app/admin/problems/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getProblemById } from "@/lib/problems/queries";
import { MarkdownPreview } from "@/components/markdown-preview";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DeleteProblemButton } from "./delete-button";

export default async function ProblemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const p = await getProblemById(id);
  if (!p) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {p.source?.name} {p.year} {p.problemNumber && `· #${p.problemNumber}`}
          </h1>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge variant="outline">Difficulty {p.difficulty}/5</Badge>
            {p.classes.map((c) => (
              <Badge key={c} variant="secondary">{c}-sinf</Badge>
            ))}
            {p.topics.map((t) => (
              <Badge key={t.id}>{t.name}</Badge>
            ))}
            {p.tags.map((t) => (
              <Badge key={t.id} variant="outline">#{t.name}</Badge>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/admin/problems/${id}/edit`}>Edit</Link>
          </Button>
          <DeleteProblemButton id={id} />
        </div>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-2">Shart</h2>
        <div className="border rounded-md p-4">
          <MarkdownPreview source={p.bodyMd} />
        </div>
      </section>

      {p.solutionMd && (
        <section>
          <h2 className="text-lg font-semibold mb-2">Yechim</h2>
          <div className="border rounded-md p-4">
            <MarkdownPreview source={p.solutionMd} />
          </div>
        </section>
      )}

      {p.answer && (
        <section>
          <h2 className="text-lg font-semibold mb-2">Javob</h2>
          <code className="bg-muted px-2 py-1 rounded">{p.answer}</code>
        </section>
      )}
    </div>
  );
}
```

Create `src/app/admin/problems/[id]/delete-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { deleteProblemAction } from "@/app/admin/problems/_actions";

export function DeleteProblemButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function onDelete() {
    setIsDeleting(true);
    await deleteProblemAction(id);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">Delete</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this problem?</DialogTitle>
          <DialogDescription>
            This is permanent. Associated images stay in storage but the
            problem record and its links to topics/tags/classes are removed.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onDelete} disabled={isDeleting}>
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Create `src/app/admin/problems/[id]/edit/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { db } from "@/db";
import { topics, sources } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { getProblemById } from "@/lib/problems/queries";
import { ProblemForm } from "@/components/problem-form";

export default async function EditProblemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const [p, topicsAvailable, sourcesAvailable] = await Promise.all([
    getProblemById(id),
    db.select().from(topics).orderBy(topics.name),
    db.select().from(sources).orderBy(sources.name),
  ]);
  if (!p) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Edit problem</h1>
      <ProblemForm
        mode="edit"
        problemId={id}
        defaultValues={{
          bodyMd: p.bodyMd,
          solutionMd: p.solutionMd,
          answer: p.answer,
          sourceId: p.sourceId,
          year: p.year,
          problemNumber: p.problemNumber,
          difficulty: p.difficulty,
          topicIds: p.topics.map((t) => t.id),
          classes: p.classes,
          tagNames: p.tags.map((t) => t.name),
        }}
        topicsAvailable={topicsAvailable}
        sourcesAvailable={sourcesAvailable}
        uploadPrefix={`problems/${id}`}
      />
    </div>
  );
}
```

### 5.9. Update the admin nav

In `src/app/admin/layout.tsx`, add a nav link to "Problems":

```tsx
<Link href="/admin/problems" className="text-sm">Problems</Link>
<Link href="/admin/problems/new" className="text-sm">+ New</Link>
```

(The list page itself comes in Phase 6; for now `/admin/problems` returns 404,
which is fine.)

---

## File structure changes

```
src/
├── components/
│   ├── markdown-editor.tsx              (new)
│   ├── metadata-form.tsx                (new)
│   └── problem-form.tsx                 (new)
├── lib/
│   └── problems/
│       ├── queries.ts                   (new)
│       └── mutations.ts                 (new)
└── app/
    └── admin/
        ├── layout.tsx                   (modified — nav)
        └── problems/
            ├── _actions.ts              (new)
            ├── new/
            │   └── page.tsx             (new)
            └── [id]/
                ├── page.tsx             (new)
                ├── delete-button.tsx    (new)
                └── edit/
                    └── page.tsx         (new)
```

---

## Acceptance criteria

- [ ] `/admin/problems/new` loads with the split editor + metadata form
- [ ] Typing in the editor updates the preview in real time, including LaTeX
- [ ] Drag-dropping a PNG into the editor uploads it to R2 and inserts
      `![filename](https://...)` at the cursor
- [ ] Switching between "Problem" and "Solution" tabs preserves both bodies
- [ ] Submitting with missing required fields (no topics, no classes,
      empty body) shows validation errors inline
- [ ] Successful submit redirects to `/admin/problems/[id]` showing the
      saved problem
- [ ] In `psql`, the new row is in `problems`, junction rows are in
      `problem_topics`, `problem_tags`, `problem_classes`
- [ ] A new free-form tag (typed by the admin) creates a row in `tags`
- [ ] Editing the problem and saving updates all fields and replaces the
      junction rows correctly
- [ ] Delete button shows a confirm dialog and deletes only after confirm
- [ ] After delete, problem is gone from DB; trying to visit the URL → 404

---

## Common pitfalls

- **Form state desync between tabs** — `react-hook-form` keeps state across
  tab changes since the inputs aren't unmounted (Tabs uses `display: none`
  by default in shadcn). If you ever switch to a Tabs variant that unmounts,
  use `unmountOnHide` carefully.
- **CodeMirror controlled value lag** — `@uiw/react-codemirror` is well-behaved
  but if you see cursor jumps, throttle `onChange` or move state lower.
- **Drag-drop fires multiple times** — make sure to `event.preventDefault()`
  in both `dragover` and `drop`.
- **Transaction not rolling back on error** — `db.transaction` in Drizzle
  rolls back if the callback throws. Don't catch errors inside the callback
  unless you re-throw.
- **`onConflictDoNothing` losing IDs** — when bulk inserting tags, the
  insert returns nothing for conflicting rows. That's why we re-query by
  slug after.
- **Image upload before save = orphans** — if the admin uploads a few images
  then closes the tab, those R2 objects are orphaned. For MVP we accept this;
  in Phase 10 add a cleanup job that deletes objects under `problems/draft/`
  older than 24h.

---

## What's next

→ [Phase 6 — Problems List, Search, Filter](./phase-06-problems-list-search-filter.md)
