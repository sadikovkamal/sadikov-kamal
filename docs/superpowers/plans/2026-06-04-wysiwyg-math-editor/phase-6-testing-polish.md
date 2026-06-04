# Phase 6 — Testing, Accessibility, Performance & Cleanup

> **Goal:** Prove the feature works end-to-end on real data, make it
> usable by a non-programmer teacher (a11y + keyboard + clarity), keep it
> fast, and remove anything the change made dead.
>
> **Depends on:** Phases 1–5.
> **Blocks:** ship.
> **Deliverables:** green checks, a documented manual test pass, polish
> commits, cleanup.

---

## Stage 6.1 — Automated checks

### Step 6.1.1 — Typecheck, lint, smokes
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run lint` clean.
- [ ] `npm run smoke` — the **whole** suite, including the new
      `wysiwyg-smoke.ts`, passes. Confirm the existing
      `markdown-smoke`, `import-smoke`, `print-smoke` still pass (proves
      we didn't disturb the untouched systems).

### Step 6.1.2 — Build
- [ ] `npm run build` exits 0. Note final bundle deltas for 6.4.

**Verification:** all four commands succeed.

---

## Stage 6.2 — Manual test matrix

Run each scenario in a real browser on `/admin/problems/new` and an
existing problem's `/edit`. Record pass/fail in a short `TEST-LOG.md`.

### Step 6.2.1 — Authoring (create)
- [ ] Plain prose only → saves; renders on detail page.
- [ ] Insert inline formula via toolbar (fraction) → fill boxes →
      commit → renders inline.
- [ ] Insert display formula (sum with limits) → renders centered.
- [ ] Insert a matrix and a `cases` block → render correctly.
- [ ] Upload an image (drag + button) → inline; one-image rule honored.
- [ ] Greek letters / relations from the symbol palettes.

### Step 6.2.2 — Editing imported problems
- [ ] Open 8–10 real corpus problems (incl. the most LaTeX-complex) →
      each renders faithfully on load.
- [ ] No-op save → detail page renders identically to before.
- [ ] Edit one formula via MathLive → saves; re-render correct.
- [ ] Edit one formula via the **per-formula raw LaTeX** fallback → saves.

### Step 6.2.3 — Source toggle
- [ ] Flip to **Manba** → exact `body_md` shown.
- [ ] Edit raw markdown → flip back → reflected visually.
- [ ] Type broken markdown → flip back is refused with a clear message;
      text preserved.
- [ ] Paste generated markdown from `ai-import-prompt` output (single
      problem) into source → flip to visual → renders.

### Step 6.2.4 — Robustness
- [ ] Paste a Word paragraph with bold/list/table → lands as clean plain
      paragraphs only (no disallowed nodes).
- [ ] Undo/redo across prose edits and formula edits.
- [ ] Very long body (e.g. a big display matrix) → no layout break, scroll
      works.

**Verification:** `TEST-LOG.md` shows every row passing (or bugs filed +
fixed and re-run).

---

## Stage 6.3 — Accessibility & keyboard (the "non-programmer teacher" goal)

### Step 6.3.1 — Keyboard-only authoring
- [ ] A full problem can be authored without a mouse: Tab to toolbar,
      activate a template, type in MathLive, Enter to commit, continue
      typing prose.
- [ ] Escape cancels a formula edit; focus returns to the editor at the
      right place.

### Step 6.3.2 — Screen-reader & labels
- [ ] Toolbar buttons have accessible names (Uzbek) and tooltips.
- [ ] Math nodes expose a sensible accessible label (KaTeX MathML /
      MathLive's a11y output) rather than raw LaTeX where possible.
- [ ] The source toggle is a labeled `aria-pressed` toggle.

### Step 6.3.3 — Focus management
- [ ] Clicking a formula opens MathLive with focus inside it.
- [ ] The MathLive virtual keyboard is reachable and dismissible.
- [ ] No focus traps; Tab order is logical (toolbar → surface → footer).

**Verification:** a keyboard-only and a quick screen-reader pass both
succeed for create + edit.

---

## Stage 6.4 — Performance

### Step 6.4.1 — Keystroke latency
- [ ] Typing prose in a large document stays smooth. If `onChange`
      serialization (`docToMarkdown` on every keystroke) lags, debounce it
      or serialize on idle (`useDeferredValue`-style), mirroring the intent
      of the old `SplitView`.
- [ ] Memoize the TipTap extensions array (don't recreate per render) —
      same lesson as the current `MarkdownEditor` `useMemo` on extensions.

### Step 6.4.2 — Bundle size
- [ ] Compare the route bundle to the Phase 0 baseline. MathLive + TipTap
      are sizable; confirm they're **only** in the lazy `ssr:false` chunk,
      not the initial server payload.
- [ ] Confirm KaTeX isn't double-bundled (it's already a dep for preview).

**Verification:** no perceptible typing lag; the heavy libs are isolated
to the editor's async chunk.

---

## Stage 6.5 — Cleanup & docs

### Step 6.5.1 — Dead code
- [ ] If the source toggle uses a plain textarea (not CodeMirror), and no
      other surface uses `MarkdownEditor`, decide whether to delete
      [`markdown-editor.tsx`](../../../../src/components/markdown-editor.tsx). If CodeMirror is fully unused,
      removing it (and `@uiw/react-codemirror`, `@codemirror/*` deps) trims
      the bundle — but only after confirming no other import.
- [ ] Remove the now-unused `SplitView`/`EmptyPreview` and preview imports
      from `problem-form.tsx` (done in Phase 5; re-verify nothing dangling).
- [ ] Delete the throwaway `scripts/spikes/` and any temporary harness
      route.

### Step 6.5.2 — Confirm the untouched systems
- [ ] `markdown-preview.tsx` unchanged and still the canonical renderer on
      detail/public/print preview.
- [ ] `src/lib/import` and the bulk-import UI unchanged (re-run
      `import-smoke`).
- [ ] `src/lib/print` unchanged (re-run `print-smoke`).
- [ ] No DB migration was added.

### Step 6.5.3 — Documentation
- [ ] Add a short section to `docs/admin-guide.md`: "Yangi masala kiritish
      — formula qo'shish" with a couple of screenshots of the toolbar and
      the source toggle, so teachers have a reference.
- [ ] Update the repo `README.md` smoke table with `wysiwyg-smoke.ts`
      (if not already done in Phase 1.4.2).
- [ ] Leave the `COMPAT-REPORT.md` and `NOTES.md` in this plan folder as a
      record; mark this plan **done** at the top of `README.md`.

**Verification:** repo is clean (no dead files/deps), untouched smokes
pass, admin guide updated.

---

## Phase 6 — Acceptance criteria

- [ ] `tsc`, `lint`, full `smoke`, and `build` all pass.
- [ ] `TEST-LOG.md` shows the full manual matrix passing.
- [ ] A problem can be authored keyboard-only; a11y labels present.
- [ ] No typing lag; heavy libs isolated to the lazy chunk.
- [ ] Dead code/deps removed; untouched systems verified; admin guide
      updated.

---

## Whole-feature done-definition (mirror of README §10)

1. Teacher creates a problem fully in WYSIWYG (inline + display formula),
   never typing LaTeX, and saves.
2. Any imported problem opens faithfully; no-op save renders identically.
3. Source toggle shows exact `body_md`; guarded both ways.
4. `tsc` + `lint` + `smoke` green.
5. Import, export, public render, search untouched and still green.
