# Phase 2 — Math Field & Math Node-Views

> **Goal:** Make formulas *feel* like MathType: a node renders with KaTeX
> at rest, opens a MathLive visual editor on focus, and always offers a
> per-formula raw-LaTeX fallback so the user is never stuck.
>
> **Depends on:** Phase 1 (schema + math node specs), Phase 0 (MathLive
> API notes, KaTeX config, COMPAT-REPORT).
> **Blocks:** Phase 3 (the toolbar inserts these nodes).
> **Deliverables:** `nodes/mathfield.tsx`, `nodes/katex-render.tsx`,
> `nodes/math-node-view.tsx`, wired into `MathInline` & `MathDisplay`.

---

## Stage 2.1 — MathLive field wrapper (`mathfield.tsx`)

MathLive is a client-only Web Component. Wrap it so the rest of the app
sees a normal controlled React component.

### Step 2.1.1 — Load MathLive client-only
- [ ] `nodes/mathfield.tsx` is a `"use client"` module.
- [ ] Import MathLive **inside** a `dynamic(..., { ssr:false })` boundary
      or lazily in `useEffect`, so the `customElements.define("math-field")`
      side-effect never runs on the server (mirror how
      [`problem-form.tsx`](../../../../src/components/problem-form.tsx) lazy-loads `MarkdownEditor`).
- [ ] Use the Next 16 dynamic-import form confirmed in Phase 0 `NOTES.md`.

### Step 2.1.2 — Controlled value + change event
- [ ] Render `<math-field>` via a `ref`. On mount:
  - [ ] set initial value: `el.setValue(latex, { silenceNotifications:true })`.
  - [ ] subscribe to the `input` event → call `onChange(el.getValue("latex"))`.
- [ ] On external `latex` prop change that differs from the field's
      current value, push it in with `setValue` (guard against feedback
      loops with the silence flag).
- [ ] Props:
  ```ts
  interface MathFieldProps {
    latex: string;
    onChange: (latex: string) => void;
    onCommit?: () => void;   // Enter / blur → close editing
    onCancel?: () => void;   // Escape → revert
    display?: boolean;       // inline vs display styling
    autoFocus?: boolean;
  }
  ```

### Step 2.1.3 — Constrain output to KaTeX-safe LaTeX
- [ ] Configure MathLive so its emitted LaTeX stays KaTeX-renderable:
  - [ ] Prefer `getValue("latex")` (not `latex-expanded`) to keep macros.
  - [ ] Apply any macro/option findings from `COMPAT-REPORT.md` (e.g.
        disable MathLive features that emit non-KaTeX commands).
- [ ] Keyboard: enable the MathLive virtual keyboard
      (`mathVirtualKeyboardPolicy: "manual"` + a toggle button, or
      `"onfocus"`), per the UX chosen in Phase 3.

### Step 2.1.4 — Styling
- [ ] Match font size/baseline to surrounding text for inline; center for
      display. Ensure the field is visually distinct while focused (a
      subtle ring) so the user knows they're "in" a formula.

**Verification:** a Storybook-less manual harness page (or a temporary
route) mounts `<MathField>`, typing builds a formula visually, and
`onChange` emits valid LaTeX that KaTeX renders.

---

## Stage 2.2 — KaTeX render helper (`katex-render.tsx`)

The resting state of a formula is a KaTeX render that **matches the
canonical preview**.

### Step 2.2.1 — Render to markup
- [ ] `nodes/katex-render.tsx`:
  ```ts
  import katex from "katex";
  export function renderKatex(latex: string, display: boolean): string {
    return katex.renderToString(latex, {
      throwOnError: false,   // never break the editor on a bad formula
      displayMode: display,
      // mirror markdown-preview / rehype-katex config from NOTES.md
    });
  }
  ```
- [ ] Use the **same options** recorded in Phase 0 `NOTES.md` so the
      editor render is pixel-equivalent to the saved render.

### Step 2.2.2 — Empty / error states
- [ ] Empty `latex` → render a placeholder chip (e.g. a faint "fx" glyph)
      so an empty formula node is visible and clickable.
- [ ] `throwOnError:false` makes KaTeX emit a red error node for bad
      input — acceptable; the user can click to fix in MathLive or raw
      mode.

**Verification:** rendering a few corpus expressions matches the
`markdown-preview` output for the same expressions (spot-check in the
browser).

---

## Stage 2.3 — Shared math node-view (`math-node-view.tsx`)

One React node-view powers both `MathInline` and `MathDisplay`; a
`display` flag toggles layout. This is where rest/edit/fallback live.

### Step 2.3.1 — Three visual states
- [ ] **Rest:** show `renderKatex(latex, display)` (KaTeX markup via
      `dangerouslySetInnerHTML` on a span/div). Clicking enters Edit.
- [ ] **Edit (visual):** show `<MathField>` (Stage 2.1). Commit on
      Enter/blur → write `latex` back to the node attrs via the node-view's
      `updateAttributes`. Cancel on Escape → revert.
- [ ] **Edit (raw fallback):** a small text `<input>`/`<textarea>` bound
      to the raw LaTeX, toggled by a "</> LaTeX" affordance on the editing
      popover. Writes the same `latex` attr. This is the **mandatory**
      escape hatch for any formula MathLive can't open visually.

### Step 2.3.2 — Node-view wiring (TipTap React)
- [ ] Use `ReactNodeViewRenderer` in `MathInline`/`MathDisplay`
      (`addNodeView()`), passing this component.
- [ ] Read `node.attrs.latex`; write via `props.updateAttributes({ latex })`.
- [ ] Mark the node-view's editing surface with
      `contentEditable={false}` / `data-drag-handle` correctly so
      ProseMirror doesn't try to manage the MathLive internals as editable
      text (atoms must be opaque to PM).

### Step 2.3.3 — Selection & deletion UX
- [ ] Backspace/Delete adjacent to the node selects-then-deletes the whole
      atom (ProseMirror default for atoms — verify it feels right).
- [ ] Clicking just before/after a display block places the cursor there
      (Gapcursor from Phase 1 enables this).
- [ ] Inline math: ensure the caret can move past it with arrow keys and
      that typing right after it continues the paragraph text.

### Step 2.3.4 — Auto-open new empty formulas
- [ ] When the toolbar (Phase 3) inserts a fresh empty formula node, it
      should mount **already in Edit (visual) state with autofocus**, so
      the teacher immediately starts filling boxes — the MathType feel.
      (Expose this via an initial attr like `justInserted: true`, consumed
      once then cleared.)

**Verification:** in a manual harness, insert an inline and a display
math node; each renders with KaTeX at rest, opens MathLive on click,
commits back, and the raw-LaTeX toggle edits the same value.

---

## Stage 2.4 — Bind node-views to the schema nodes

### Step 2.4.1 — Attach node-views
- [ ] In `schema/math-inline.ts` and `schema/math-display.ts`, add
      `addNodeView() { return ReactNodeViewRenderer(MathNodeView); }` with
      the `display` flag fixed per node.
- [ ] Confirm `getJSON()` still yields `{ type, attrs:{ latex } }` (the
      node-view is presentation only — it must not change serialization,
      which Phase 1's I/O depends on).

### Step 2.4.2 — Re-run the Phase 1 smoke
- [ ] Because node-views are pure presentation, `markdownToDoc` /
      `docToMarkdown` are unaffected. Re-run `scripts/wysiwyg-smoke.ts` to
      confirm still 100% green (regression guard).

**Verification:** smoke stays green; `editor.getJSON()` shape unchanged.

---

## Phase 2 — Acceptance criteria

- [ ] `<MathField>` is a controlled, client-only wrapper emitting
      KaTeX-safe LaTeX; the virtual keyboard works.
- [ ] `renderKatex` mirrors the canonical preview config.
- [ ] The shared node-view renders KaTeX at rest, opens MathLive on
      focus, commits/cancels correctly, and exposes a **per-formula raw
      LaTeX** fallback.
- [ ] Inserting a fresh formula opens it focused in MathLive.
- [ ] Selection/caret/delete around inline and display atoms behave
      naturally.
- [ ] `scripts/wysiwyg-smoke.ts` remains 100% green; serialization shape
      unchanged.
