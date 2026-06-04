# Phase 0 — Foundations, Spike & Dependencies

> **Goal:** Remove every unknown *before* writing feature code. Read the
> Next.js 16 docs that matter, confirm the real shape of existing data,
> install dependencies, and prove the one genuine risk (MathLive↔KaTeX
> compatibility) on a real corpus.
>
> **Depends on:** nothing.
> **Blocks:** every other phase.
> **Deliverables:** updated `package.json`/lockfile, a real-data corpus
> fixture, a compatibility report, and an empty component skeleton.

This phase writes **no feature code**. Its output is knowledge + a fixture
+ dependencies. Treat the spike script as throwaway.

---

## Stage 0.1 — Preflight reading

The project's `AGENTS.md` warns that this Next.js is modified and that
APIs may differ from training data. Read before coding.

### Step 0.1.1 — Read the Next 16 docs that this feature touches
- [ ] Read `node_modules/next/dist/docs/` for **dynamic imports** /
      `next/dynamic` and **Client Components**. We rely on
      `dynamic(..., { ssr: false })` for both MathLive and the editor.
  - [ ] Confirm the exact `next/dynamic` signature and whether `ssr:false`
        is still supported in a Client Component context (it is the
        pattern [`problem-form.tsx`](../../../../src/components/problem-form.tsx) already uses for `MarkdownEditor` — re-confirm it is still valid in this Next version).
  - [ ] Note any change to how Client Components are marked (`"use client"`).
- [ ] Read any docs on **Web Components / custom elements** interop if
      present (MathLive registers `<math-field>`).

### Step 0.1.2 — Skim the library docs we will use
- [ ] **TipTap:** the React quick-start, custom node (`Node.create`),
      `addNodeView` (React node-views), and `addInputRules`. Confirm the
      installed major version's import paths.
- [ ] **MathLive:** the `<math-field>` element, reading/writing value
      (`getValue("latex")` / `setValue`), the `input` event, macro
      configuration, and `mathVirtualKeyboardPolicy`.
- [ ] **KaTeX:** `renderToString(latex, options)` options, especially
      `throwOnError`, `displayMode`, `strict`, and `macros`.

### Step 0.1.3 — Record the canonical KaTeX config
- [ ] Open [`markdown-preview.tsx`](../../../../src/components/markdown-preview.tsx) and note exactly how `rehype-katex`
      is configured (defaults today). The editor's KaTeX render MUST match
      this so the resting node looks like the saved render.
- [ ] Write the findings (versions, config, gotchas) into a short
      `NOTES.md` in this plan folder so later phases don't re-derive them.

**Verification:** `NOTES.md` exists and answers: (a) the exact
`next/dynamic` usage, (b) the installed TipTap major version + import
paths, (c) MathLive value/event API, (d) the KaTeX options to mirror.

---

## Stage 0.2 — Real-data audit (build the corpus fixture)

We must round-trip *real* problems, not just the sample bundle. Build a
fixture of real `body_md` values to drive the Phase 1 tests and the
Phase 0.4 spike.

### Step 0.2.1 — Pull a representative sample of `body_md`
- [ ] With the local DB running (`docker compose up -d`), query a sample
      of real bodies. Prefer variety over volume — aim for 30–80 rows that
      include: plain-text-only, inline-math-heavy, display-math,
      image-bearing, and the most LaTeX-complex problems available.
  - [ ] Example query to run via `tsx` or `db:studio`:
        `select code, body_md from problems order by length(body_md) desc limit 50;`
        plus a random sample: `... order by random() limit 30;`
- [ ] If the local DB is empty, export a sample from production (Neon)
      **read-only**, or reconstruct from the existing import bundles you
      uploaded. Do **not** modify production.

### Step 0.2.2 — Freeze the corpus as a fixture
- [ ] Save the collected bodies to
      `scripts/fixtures/wysiwyg-corpus.json` as an array of
      `{ code, bodyMd }`. Strip nothing — keep exact text including
      whitespace.
- [ ] Add the bundled sample too: include the three bodies from
      [`docs/examples/sample-batch/problems.md`](../../../examples/sample-batch/problems.md) (post-`# Shart` content)
      so the fixture is reproducible even without DB access.

### Step 0.2.3 — Catalog the grammar actually present
- [ ] Scan the corpus and confirm only: paragraphs, inline `$...$`,
      display `$$...$$`, and `![alt](url)` images appear.
- [ ] **If anything else appears** (a table, a list, bold, a heading),
      stop and record it in `NOTES.md` — it widens the schema and must be
      handled in Phase 1. (Expected: nothing else appears.)

**Verification:** `scripts/fixtures/wysiwyg-corpus.json` exists with ≥30
real bodies; `NOTES.md` confirms the grammar (or lists exceptions).

---

## Stage 0.3 — Dependencies

### Step 0.3.1 — Add the packages
- [ ] Add to `package.json` `dependencies`:
  - [ ] `mathlive` (latest 0.x stable — pin the minor).
  - [ ] `@tiptap/react`, `@tiptap/core`, `@tiptap/pm` (ProseMirror bundle).
  - [ ] `@tiptap/extension-document`, `@tiptap/extension-paragraph`,
        `@tiptap/extension-text`.
  - [ ] `@tiptap/extension-history` (undo/redo), `@tiptap/extension-gapcursor`
        (cursor placement around block atoms — needed for display math &
        images), `@tiptap/extension-dropcursor`.
  - [ ] Confirm all `@tiptap/*` packages share **one** major version.
  - [ ] `katex`, `remark-parse`, `remark-math`, `unified`,
        `mdast-util-to-string` are **already present** — do not re-add;
        verify versions.
- [ ] Run `npm install`; commit the lockfile change.

### Step 0.3.2 — Verify the build tolerates the new deps (unused)
- [ ] `npm run build` exits 0 with the packages installed but not yet
      imported anywhere.
- [ ] Check the dev bundle: note MathLive + TipTap added weight (for the
      Phase 6 performance check baseline).

**Verification:** `npm install` clean, `npm run build` exits 0.

---

## Stage 0.4 — MathLive ↔ KaTeX compatibility spike (throwaway)

This is the single real technical risk. Prove it now, cheaply, before
committing the architecture to UI.

### Step 0.4.1 — Extract every LaTeX expression from the corpus
- [ ] Write `scripts/spikes/mathlive-compat.ts` (throwaway; under a
      `spikes/` dir so it's obviously not production). Parse each corpus
      body with `remark-parse` + `remark-math` and collect every
      `inlineMath`/`math` node's `value` (the LaTeX).

### Step 0.4.2 — Round-trip each expression through MathLive
- [ ] For each LaTeX string `L`:
  - [ ] Load it into a headless MathLive (`MathfieldElement` /
        `convertLatexToMathMl` or `convertLatexToMarkup` as available in
        the installed version; if a DOM is required, run under jsdom or a
        Playwright page).
  - [ ] Read back `L' = mathfield.getValue("latex")`.
  - [ ] Render both `L` and `L'` with `katex.renderToString(..., {throwOnError:false})`.
  - [ ] Flag a problem if: MathLive throws/empties on input, **or** the
        KaTeX render of `L'` differs structurally from `L`, **or** KaTeX
        errors on `L'`.

### Step 0.4.3 — Produce the compatibility report
- [ ] Output `docs/superpowers/plans/2026-06-04-wysiwyg-math-editor/COMPAT-REPORT.md`:
      total expressions, count clean, and a table of every failing
      expression with the failure mode.
- [ ] Decide per failing class:
  - [ ] Most should be **non-blocking** → handled by the per-formula
        raw-LaTeX fallback (Phase 2.3).
  - [ ] If a *large* fraction fail to even load into MathLive, escalate:
        reconsider whether MathLive should be the default (vs. a
        raw-LaTeX-first node with optional MathLive). Record the decision.

**Verification:** `COMPAT-REPORT.md` exists; the failing rate is
understood and either accepted (fallback covers it) or escalated with a
written decision.

---

## Stage 0.5 — Component skeleton

Create the empty folder structure so later phases drop files into a known
layout. No logic yet — just exported stubs that typecheck.

### Step 0.5.1 — Scaffold directories and stub exports
- [ ] Create the `src/components/problem-body-editor/` tree from the
      README file map, each file exporting a typed stub (e.g.
      `export function ProblemBodyEditor(_: ProblemBodyEditorProps) { return null; }`).
- [ ] Define and export the **public prop contract** in `index.tsx` so
      Phase 5 can integrate against it early:
  ```ts
  export interface ProblemBodyEditorProps {
    value: string;                 // body_md
    onChange: (next: string) => void;
    uploadPrefix: string;          // "problems/draft" | "problems/{id}"
    minHeight?: string;
  }
  ```
  This mirrors the existing `MarkdownEditor` contract so it's a drop-in
  at the form layer.

### Step 0.5.2 — Confirm it compiles
- [ ] `npx tsc --noEmit` is clean with the stubs in place.

**Verification:** the folder tree exists, all stubs export, `tsc` clean.

---

## Phase 0 — Acceptance criteria

- [ ] `NOTES.md` records the Next 16 dynamic-import usage, TipTap version
      + import paths, MathLive value/event API, and the KaTeX config to
      mirror.
- [ ] `scripts/fixtures/wysiwyg-corpus.json` holds ≥30 real bodies plus
      the bundled samples; grammar confirmed (or exceptions logged).
- [ ] `package.json` + lockfile updated; `npm run build` exits 0.
- [ ] `COMPAT-REPORT.md` quantifies MathLive↔KaTeX compatibility and the
      handling decision is written down.
- [ ] `src/components/problem-body-editor/` skeleton compiles with a
      stable public prop contract.

> **Do not start Phase 1 until every box above is ticked.** Phase 1's
> tests consume the corpus fixture, and its design assumes the grammar
> confirmed here.
