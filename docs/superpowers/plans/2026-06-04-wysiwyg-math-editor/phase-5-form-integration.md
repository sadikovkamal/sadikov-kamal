# Phase 5 — Form Integration (create + edit)

> **Goal:** Drop `ProblemBodyEditor` into the real problem form, replacing
> the two-pane `SplitView`, and make both the **create** and the
> **edit-an-imported-problem** flows load and save correctly through
> react-hook-form — with no change to validation, submit, or the metadata
> section.
>
> **Depends on:** Phases 1–4 (the full editor).
> **Blocks:** Phase 6 (testing).
> **Deliverables:** edits to [`problem-form.tsx`](../../../../src/components/problem-form.tsx).

---

## Stage 5.1 — Replace `SplitView` with `ProblemBodyEditor`

### Step 5.1.1 — Swap the editor in `BodyEditor`
- [ ] In [`problem-form.tsx`](../../../../src/components/problem-form.tsx), the `BodyEditor` subtree currently
      subscribes to `bodyMd` via `useWatch` and writes via `setValue`
      (`problem-form.tsx:309`). Keep that exact wiring; replace the
      `<SplitView>` render with `<ProblemBodyEditor>`:
  ```tsx
  <ProblemBodyEditor
    value={value}
    onChange={(v) => setValue(fieldName, v, { shouldDirty: true })}
    uploadPrefix={uploadPrefix}
    minHeight="240px"
  />
  ```
- [ ] Remove `SplitView`, `EmptyPreview`, and the now-unused preview
      imports (`MarkdownPreview`, `useDeferredValue`, `Eye`, `Pencil`) from
      this file — **unless** Phase 4 reuses CodeMirror (then keep its
      import path intact).

### Step 5.1.2 — Keep validation and the form contract identical
- [ ] `formSchema` already validates `bodyMd: z.string().min(1, …)`
      (`problem-form.tsx:50`). No change — `ProblemBodyEditor` emits a
      string. An empty editor must emit `""` (not `"\n"` or a stray
      paragraph) so the `min(1)` rule fires correctly. Verify
      `docToMarkdown(emptyDoc) === ""`.
- [ ] `FieldHint` error display under the editor stays as-is.

### Step 5.1.3 — Keep the image-upload header
- [ ] The form currently renders an `ImageUploadField` in the "Masala
      matni" section header (`problem-form.tsx:141`). Decide the division
      of labor with the editor's own inline image support (Phase 3.3):
  - [ ] **Option A (recommended):** the editor owns image insertion
        (inline, drag-drop + its own button); remove the separate
        `ImageUploadField` header control to avoid two image concepts.
  - [ ] **Option B:** keep the header control for a "primary image" and
        the editor for inline ones — only if product wants both. Given the
        one-image convention, **Option A is cleaner**; confirm and
        document.

**Verification:** the create form renders the new single-surface editor in
place of the split view; submitting an empty body still shows the
"bo'sh bo'lmasligi kerak" validation error.

---

## Stage 5.2 — Create flow

### Step 5.2.1 — Empty initial value
- [ ] On `/admin/problems/new`, `defaultValues.bodyMd` is `""`. The editor
      mounts empty (one empty paragraph), toolbar ready.
- [ ] `uploadPrefix` is `"problems/draft"` (unchanged).

### Step 5.2.2 — Submit
- [ ] On submit, `values.bodyMd` is the serialized markdown from the
      editor. `createProblemAction(values)` is unchanged — it stores
      `body_md` exactly as before.
- [ ] Verify the created row's `body_md` renders identically on the detail
      page (canonical `markdown-preview`).

**Verification:** create a new problem with one inline + one display
formula + an image entirely via the WYSIWYG UI; it saves; the detail page
renders it correctly.

---

## Stage 5.3 — Edit flow (the critical path: imported problems)

### Step 5.3.1 — Load existing `body_md`
- [ ] On `/admin/problems/[code]/edit`, `defaultValues.bodyMd` is the
      stored markdown (bulk-imported). `ProblemBodyEditor` parses it via
      `markdownToDoc` (Phase 3.1.1) and shows the rendered problem.
- [ ] `uploadPrefix` is `"problems/{id}"` (unchanged).

### Step 5.3.2 — Edit & save
- [ ] Editing prose/formulas updates `value`; `updateProblemAction` is
      unchanged.
- [ ] **No-op guarantee:** opening an imported problem and saving with no
      edits must produce `body_md` that **renders identically** to the
      original (whitespace reflow allowed). This is exactly the Phase 1
      render-equivalence property, now exercised through the real form.

### Step 5.3.3 — Spot-check across the corpus
- [ ] Manually open 5–10 of the most complex real problems (from the
      Phase 0 corpus) in the edit form; confirm each renders faithfully
      and round-trips on save.

**Verification:** editing an imported problem loads it visually, a small
edit saves correctly, and a no-op save preserves rendering.

---

## Stage 5.4 — Lazy-loading & SSR

### Step 5.4.1 — Dynamic import with `ssr:false`
- [ ] Like the current `MarkdownEditor`, load `ProblemBodyEditor` via
      `dynamic(() => import("@/components/problem-body-editor").then(m => m.ProblemBodyEditor), { ssr:false, loading: … })`
      so MathLive/TipTap never run on the server. Reuse the existing
      "Loading editor…" placeholder style.
- [ ] Confirm the dynamic-import form matches Phase 0 `NOTES.md` for this
      Next version.

### Step 5.4.2 — No hydration warnings
- [ ] Load both `/new` and `/edit` pages; check the console for hydration
      or custom-element warnings; resolve any.

**Verification:** both pages load with the editor lazy-loaded, no SSR or
hydration errors in the console.

---

## Phase 5 — Acceptance criteria

- [ ] `SplitView` is replaced by `ProblemBodyEditor`; the form's
      `useWatch`/`setValue`/validation wiring is unchanged.
- [ ] Empty editor emits `""` so `min(1)` validation still works.
- [ ] Create flow saves a WYSIWYG-authored problem that renders correctly
      on the detail page.
- [ ] Edit flow loads imported problems faithfully; no-op save preserves
      rendering; complex corpus problems verified by hand.
- [ ] Editor is lazy-loaded `ssr:false` with no hydration warnings.
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run smoke` all pass.
