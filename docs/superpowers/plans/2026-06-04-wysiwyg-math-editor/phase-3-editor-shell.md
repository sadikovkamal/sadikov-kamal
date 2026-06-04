# Phase 3 — Editor Shell & Formula Toolbar

> **Goal:** Assemble the single editing surface: the TipTap editor
> instance wired to the locked schema and math node-views, a top toolbar
> that inserts formulas MathType-style, inline image upload, and
> paste/keyboard rules that keep the document inside the grammar.
>
> **Depends on:** Phase 1 (schema, I/O), Phase 2 (math node-views).
> **Blocks:** Phase 4 (toggle wraps this), Phase 5 (form integration).
> **Deliverables:** `index.tsx` (ProblemBodyEditor), `toolbar/formula-toolbar.tsx`,
> `toolbar/templates.ts`, `nodes/image-node-view.tsx`.

---

## Stage 3.1 — The editor instance (`index.tsx`)

### Step 3.1.1 — Controlled editor bound to `body_md`
- [ ] `ProblemBodyEditor` (the public component) uses `useEditor` from
      `@tiptap/react` with `editorExtensions` (Phase 1).
- [ ] **Initialize** content from the `value` prop via
      `markdownToDoc(value)`:
      `useEditor({ extensions, content: markdownToDoc(value) })`.
- [ ] **Emit** on every change:
      `onUpdate({ editor }) => onChange(docToMarkdown(editor.getJSON()))`.
- [ ] Debounce/defer the `onChange` serialization if profiling shows
      keystroke lag (mirrors the existing `useDeferredValue` intent in
      `SplitView`); start simple, optimize in Phase 6.

### Step 3.1.2 — Controlled-value reconciliation
- [ ] Guard the classic controlled-editor pitfall: when `value` changes
      from **outside** (e.g. the source toggle in Phase 4 writes new md, or
      the edit form loads), update editor content **only if** the incoming
      `value` differs from the current `docToMarkdown(editor.getJSON())`.
      Otherwise every keystroke would reset the cursor.
- [ ] Use `editor.commands.setContent(markdownToDoc(value), false)` for
      external updates (the `false` avoids emitting another update).

### Step 3.1.3 — Layout & chrome
- [ ] One bordered surface (reuse the card styling from the current
      `SplitView` editor pane in [`problem-form.tsx`](../../../../src/components/problem-form.tsx)).
- [ ] Header row hosts the **formula toolbar** (Stage 3.2) and the
      existing **image upload** affordance; a small right-aligned
      "Manba" toggle slot is reserved for Phase 4.
- [ ] `minHeight` from props; grow with content; scroll on overflow.
- [ ] Remove the separate "Ko'rinish" (preview) pane entirely — this
      surface *is* the rendered view.

**Verification:** the editor mounts, shows content parsed from a sample
`body_md`, typing prose emits updated markdown via `onChange`, and the
cursor does not jump.

---

## Stage 3.2 — Formula toolbar (`formula-toolbar.tsx` + `templates.ts`)

The toolbar is the MathType-style "click a tool, fill the boxes" entry
point.

### Step 3.2.1 — Define templates
- [ ] `toolbar/templates.ts` — each template is a labeled icon plus a
      MathLive insertion (a LaTeX skeleton with placeholders). Cover the
      olympiad essentials:
  - [ ] Fraction `\frac{#?}{#?}`, mixed/derivative forms
  - [ ] Roots `\sqrt{#?}`, `\sqrt[#?]{#?}`
  - [ ] Power / subscript `{#?}^{#?}`, `{#?}_{#?}`
  - [ ] Sum / product / integral `\sum_{#?}^{#?}`, `\prod`, `\int`
  - [ ] Limits, `\binom{#?}{#?}`
  - [ ] Greek letters palette (α, β, γ, …, π, Σ, Δ, …)
  - [ ] Relations/operators (`\leq \geq \neq \approx \in \subset \cup \cap \cdot \times`)
  - [ ] Cases `\begin{cases} … \end{cases}` and matrices `\begin{pmatrix}…\end{pmatrix}`
  - [ ] Vectors/accents `\vec{#?}`, `\overline{#?}`, `\widehat{#?}`
  - [ ] (`#?` is MathLive's placeholder token — confirm the exact syntax
        from the installed version in Phase 0 `NOTES.md`.)
- [ ] Each template marked `inline` or `display` (or both) so the right
      node type is created.

### Step 3.2.2 — Insertion behavior
- [ ] Clicking a template:
  - [ ] inserts a fresh `mathInline` (or `mathDisplay`) node at the
        selection with the skeleton LaTeX,
  - [ ] sets `justInserted: true` so the node-view (Phase 2.3.4) opens
        MathLive **focused on the first placeholder**.
- [ ] An explicit "Insert inline formula" and "Insert display formula"
      button each open an **empty** MathLive node (free-form entry), for
      users who'd rather build from scratch than pick a template.

### Step 3.2.3 — Toolbar UX
- [ ] Group templates under compact popover menus (Fraction/Roots,
      Sums/Integrals, Greek, Symbols, Structures) to avoid a wall of
      buttons.
- [ ] Disable formula insertion when the selection is inside an existing
      math atom (can't nest a node inside an atom; instead the click
      should focus/append within the open MathLive field if one is
      active).
- [ ] Tooltips with the math name in Uzbek (matches the app's UI
      language).

**Verification:** clicking "Fraction" inserts a fraction node that opens
in MathLive with the numerator box focused; filling both boxes and
committing renders the fraction inline; the emitted markdown contains the
expected `$\frac{a}{b}$`.

---

## Stage 3.3 — Inline image node (`image-node-view.tsx`)

Reuse the existing upload pipeline; render the image inline as a block
atom.

### Step 3.3.1 — Upload integration
- [ ] Reuse `uploadImageAction` exactly as
      [`markdown-editor.tsx`](../../../../src/components/markdown-editor.tsx) and the form's `ImageUploadField`
      do (same `prefix`/`uploadPrefix` semantics).
- [ ] Two entry points:
  - [ ] **Drag-and-drop** onto the editor → upload → insert an `image`
        node at the drop position (port the drop handler logic from
        `markdown-editor.tsx`).
  - [ ] The existing header **"Rasm yuklash"** button → upload → insert an
        `image` node at the current selection.
- [ ] Respect the **at-most-one-image** convention (format-spec): if an
      image already exists, replace it or warn (match the single-problem
      form's current behavior — confirm what it does today and mirror it).

### Step 3.3.2 — Render & remove
- [ ] `image-node-view.tsx` renders the image (Next `<Image>` or a plain
      `<img>` — check what the preview/detail page uses for R2 URLs and
      match) with a small remove (×) control on hover.
- [ ] `alt` editable via a tiny caption input (optional; default to the
      uploaded filename, matching import behavior).

### Step 3.3.3 — Serialization check
- [ ] Confirm an inserted image serializes to `![alt](url)` via
      `docToMarkdown` and re-parses to the same node (extend the smoke
      fixture with an image case if not already covered).

**Verification:** dragging an image in uploads and inserts it inline;
`onChange` markdown contains `![...](https://…)`; removing it cleans up
the node.

---

## Stage 3.4 — Paste & keyboard sanitation

Keep the document inside the grammar no matter what the user pastes or
types.

### Step 3.4.1 — Paste filtering
- [ ] Because the schema is closed, ProseMirror already drops disallowed
      nodes on paste — but verify: pasting rich HTML (bold, lists, tables)
      lands as **plain paragraphs/text only**. Add a `transformPasted`/
      `clipboardTextParser` if needed so pasted **plain markdown text**
      (e.g. someone copies `$x^2$` from elsewhere) is offered through
      `markdownToDoc` rather than inserted literally. Decide and document
      the paste contract:
  - [ ] Pasting from another rich source → strip to plain text.
  - [ ] Pasting plain text that looks like our markdown → optionally parse
        via `markdownToDoc` (nice-to-have; safe default is literal text
        that the user can convert).

### Step 3.4.2 — Optional input rule: `$…$` to math
- [ ] Quality-of-life: an input rule that, when a user types `$`, starts
      an inline-math node (so LaTeX-fluent users can type `$` and go
      straight into MathLive). Gate behind Phase 6 polish — not required
      for the core MathType flow (toolbar is the primary path).

### Step 3.4.3 — Keyboard map
- [ ] Standard: Enter = new paragraph; Shift-Enter handling (decide:
      soft break vs nothing — our grammar has no hard line breaks, so map
      Shift-Enter to a new paragraph or ignore).
- [ ] Undo/redo via the History extension; confirm Ctrl/Cmd-Z works across
      math-node edits too.

**Verification:** pasting a Word paragraph with bold/lists yields clean
plain paragraphs; no disallowed nodes ever enter the document
(`getJSON()` only contains the six allowed types).

---

## Phase 3 — Acceptance criteria

- [ ] `ProblemBodyEditor` is a controlled component: `value` (body_md) in,
      `onChange` (body_md) out, cursor-stable, with external-update
      reconciliation.
- [ ] The preview pane is gone; the single surface renders math inline.
- [ ] The formula toolbar inserts inline & display formulas (templates +
      empty), opening MathLive focused for immediate entry.
- [ ] Images upload via drag-drop and the header button, render inline,
      and serialize to `![alt](url)`.
- [ ] The document can only ever contain the six allowed node types,
      including after arbitrary paste.
- [ ] `scripts/wysiwyg-smoke.ts` still green; `tsc` + `lint` clean.
