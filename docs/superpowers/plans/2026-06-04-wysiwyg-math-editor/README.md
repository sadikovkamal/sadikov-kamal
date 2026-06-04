# WYSIWYG Math Editor — Implementation Plan (Overview)

> **Status:** Implemented (Phases 0–5) on branch `feat/wysiwyg-math-editor`.
> Verified by typecheck + production build + the round-trip/render smoke
> (66/66) + in-browser testing of the live editor (render, MathLive,
> toolbar, source toggle). **Pending:** full manual matrix against real
> imported problems with the local DB running, and the optional polish in
> Phase 6 (a11y deep pass, perf profiling, admin-guide screenshots).
> **Date:** 2026-06-04
> **Owner area:** Single-problem create/edit form (`/admin/problems/new`, `/admin/problems/[code]/edit`).

This folder holds the full, phase-by-phase plan to replace the current
two-pane Markdown/LaTeX editor with a single-surface **WYSIWYG math
editor** — a MathType / Word-Equation-style experience where a
non-programmer math teacher types prose and inserts formulas from a
toolbar, seeing everything rendered inline.

Each phase lives in its own file. Read this overview first, then execute
the phases in order.

| File | Phase | Summary |
|---|---|---|
| [`phase-0-foundations.md`](phase-0-foundations.md) | 0 | Preflight reading, real-data audit, dependencies, MathLive↔KaTeX compatibility spike, folder skeleton |
| [`phase-1-markdown-io.md`](phase-1-markdown-io.md) | 1 | Locked editor schema + lossless `body_md` ⇄ document converters + round-trip smoke test (pure functions, no UI) |
| [`phase-2-math-nodes.md`](phase-2-math-nodes.md) | 2 | MathLive field wrapper, KaTeX render, inline & display math node-views, per-formula raw-LaTeX fallback |
| [`phase-3-editor-shell.md`](phase-3-editor-shell.md) | 3 | TipTap editor instance, formula toolbar, image node + upload, paste/keyboard sanitation |
| [`phase-4-source-toggle.md`](phase-4-source-toggle.md) | 4 | Whole-document "Manba" (raw markdown) mode with guarded two-way sync |
| [`phase-5-form-integration.md`](phase-5-form-integration.md) | 5 | Replace `SplitView`, wire into react-hook-form, create + edit flows, lazy-load |
| [`phase-6-testing-polish.md`](phase-6-testing-polish.md) | 6 | Automated checks, manual matrix, a11y, performance, cleanup |

---

## 1. Goal

Replace the current **two-pane** body editor (left/top: raw Markdown +
LaTeX in CodeMirror; bottom: rendered preview) with **one** editing
surface where:

- The teacher types the problem statement as normal text.
- To insert a formula, they click a tool in the top toolbar (fraction,
  root, power, sum, …), fill in the boxes, and the formula renders
  **inline, immediately** — they never see LaTeX.
- Images insert inline (existing upload action reused).
- Power users / admins can flip a **"Manba" toggle** to view/edit the
  raw Markdown when needed.

The teacher never writes LaTeX by hand, but the database still stores
Markdown with LaTeX `$...$` / `$$...$$` — unchanged.

## 2. The single invariant that makes this safe

> **Only the editing experience changes. The stored format (`body_md`:
> Markdown + LaTeX) stays byte-compatible in meaning.**

`body_md` is consumed by four systems, **none of which change**:

1. **Public / preview render** — [`markdown-preview.tsx`](../../../../src/components/markdown-preview.tsx) (remark-math + rehype-katex). Remains the *canonical* renderer.
2. **DOCX export** — [`math-omml.ts`](../../../../src/lib/print/math-omml.ts) parses LaTeX → MathML → OMML.
3. **Bulk import** — [`src/lib/import`](../../../../src/lib/import) produces `body_md`.
4. **Full-text search** — GIN index `to_tsvector('simple', body_md)`.

Because the output contract is untouched, export, import, public render,
and search keep working with no migration.

## 3. Locked decisions (from requirements gathering)

| Decision | Choice | Consequence |
|---|---|---|
| Existing data | **All problems were created via bulk import (ZIP)** | The Markdown grammar to round-trip is tiny and known (see §4) |
| Body content | **Plain text + inline math + display math + ≤1 image only** | No tables/lists/bold/headings → round-trip is low-risk |
| Rollout | **Direct full WYSIWYG** (no phased MathLive-dialog-first) | This plan builds the full editor |
| Source toggle | **Yes — include it** | Phase 4 |
| Import flow | **Do not touch** | `src/lib/import` and the ZIP upload UI are out of scope |
| DB schema | **No migration** | `body_md` stays a `text` column |

## 4. The exact Markdown grammar we must round-trip

Confirmed by reading the importer ([`parse.ts`](../../../../src/lib/import/parse.ts) `extractShartBody` strips the `# Shart` heading) and the AI prompt ([`ai-import-prompt.md`](../../../ai-import-prompt.md)). Every stored `body_md` is **only**:

```
- Paragraphs of plain text (Uzbek prose, may contain soft line-wraps)
- Inline math:    $ ... $
- Display math:   $$ ... $$
- At most one image: ![alt](https://<r2-public-url>/...)
```

No tables, no lists, no bold/italic, no headings, no code blocks. This
narrow grammar is what makes a 100%-faithful round-trip achievable.

## 5. Architecture (the optimal approach)

```
                    ┌─────────────────────────────────────────┐
   body_md (DB) ──► │  markdownToDoc()   (remark-math → mdast  │
                    │                     → ProseMirror doc)   │
                    └───────────────┬─────────────────────────┘
                                    ▼
                    ┌─────────────────────────────────────────┐
                    │   TipTap editor (LOCKED schema)          │
                    │   doc → (paragraph | mathDisplay | image)│
                    │   paragraph → (text | mathInline)*       │
                    │                                          │
                    │   • math node-view:                      │
                    │       rest  → KaTeX render               │
                    │       focus → MathLive field (MathType)  │
                    │       fallback → raw-LaTeX input         │
                    │   • toolbar inserts formula templates    │
                    │   • image node reuses upload action      │
                    │   • "Manba" toggle → raw markdown        │
                    └───────────────┬─────────────────────────┘
                                    ▼
                    ┌─────────────────────────────────────────┐
   body_md (DB) ◄── │  docToMarkdown()  (ProseMirror doc       │
                    │                    → escaped markdown)    │
                    └─────────────────────────────────────────┘
```

### Tech choices & rationale

- **TipTap (ProseMirror, MIT)** for the editing surface. We **do not use
  StarterKit**; we compose only `Document`, `Paragraph`, `Text`, plus our
  custom `MathInline`, `MathDisplay`, `Image` nodes. Composing a minimal
  extension set **locks the schema** — the editor *cannot* create bold,
  headings, tables, etc., which is what guarantees round-trip fidelity
  (the document can only serialize to our tiny grammar). It also gives us
  selection, cursor, copy/paste, undo/redo, and inline-atom handling for
  free.

- **MathLive (`mathlive`, MIT)** for *editing* a formula. It is the
  open-source MathType / Word-equation-editor equivalent: a visual
  fraction/root/power builder plus a symbol keyboard, emitting LaTeX. It
  is a Web Component (`<math-field>`), client-only — loaded with
  `dynamic(..., { ssr: false })` exactly like CodeMirror is today.

- **KaTeX (already a dependency)** for *rendering* a formula in the
  node's resting state. We deliberately render math nodes with the same
  KaTeX configuration the canonical [`markdown-preview.tsx`](../../../../src/components/markdown-preview.tsx) uses, so "what
  you see in the editor" matches "what is rendered/saved."

- **Dedicated Markdown I/O built on remark-math** (not a generic
  WYSIWYG↔markdown bridge). `markdownToDoc` parses with the *same*
  tokenizer the canonical renderer uses (`remark-parse` + `remark-math`,
  already dependencies), so math boundaries the editor sees are identical
  to what the renderer renders. `docToMarkdown` serializes our tiny PM
  grammar back to `$...$` / `$$...$$` / `![alt](url)` with explicit
  escaping. Both are pure, unit-tested functions.

### Two escape hatches (do not confuse them)

| | Per-formula raw LaTeX | Whole-document "Manba" toggle |
|---|---|---|
| Scope | One formula node | The entire `body_md` |
| Solves | MathLive can't visually open a particular formula | Trust/verify stored text, fast typing, paste markdown, recover from a parser bug |
| Status | **Mandatory** (Phase 2) | **Included** (Phase 4) |

## 6. File map

**Create:**

```
src/components/problem-body-editor/
├── index.tsx              ProblemBodyEditor (public component)
├── schema/
│   ├── extensions.ts      TipTap extension list (locked set)
│   ├── math-inline.ts     MathInline node spec
│   ├── math-display.ts    MathDisplay node spec
│   └── image.ts           Image node spec
├── markdown/
│   ├── markdown-to-doc.ts  body_md  → ProseMirror JSON
│   ├── doc-to-markdown.ts  ProseMirror JSON → body_md
│   └── escape.ts           markdown text escaping helpers
├── nodes/
│   ├── math-node-view.tsx  shared node-view (KaTeX rest / MathLive edit / raw fallback)
│   ├── mathfield.tsx       MathLive <math-field> React wrapper (ssr:false)
│   ├── katex-render.tsx    KaTeX render helper aligned with markdown-preview
│   └── image-node-view.tsx image render + remove
├── toolbar/
│   ├── formula-toolbar.tsx the top toolbar
│   └── templates.ts        formula template definitions
├── source-mode/
│   └── source-toggle.tsx   "Manba" raw-markdown mode
└── katex.css               (if a scoped KaTeX stylesheet is needed)

scripts/wysiwyg-smoke.ts    round-trip + render-equivalence smoke test
```

**Modify:**

```
src/components/problem-form.tsx   Replace SplitView/BodyEditor with ProblemBodyEditor
package.json                      Add mathlive + tiptap packages
scripts/run-all-smokes.sh         Register wysiwyg-smoke.ts
```

**Untouched (explicitly out of scope):** everything under
`src/lib/import`, `src/lib/print`, `markdown-preview.tsx`, the metadata
pickers, and the DB schema.

## 7. Top risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| MathLive can't visually parse some KaTeX formula | Medium | Per-formula raw-LaTeX fallback (Phase 2.3); compatibility spike over real corpus (Phase 0.4) |
| MathLive emits LaTeX KaTeX can't render | Low–Med | Configure MathLive output to KaTeX-safe macros; render-equivalence test (Phase 1.4) |
| Round-trip changes byte-level whitespace (soft wraps reflow) | High (cosmetic only) | Accept: render & export are identical; document it; source toggle exposes truth |
| `markdownToDoc` mis-parses a real problem | Low (tiny grammar, remark-based) | Corpus-based round-trip + render-equivalence smoke test on real data (Phase 0.2, 1.4) |
| Next 16 dynamic-import / client-component API differs from training data | Medium | Phase 0.1 reads `node_modules/next/dist/docs` before any code |
| SSR of a Web Component | Low | `dynamic(..., { ssr:false })`, mirrors current CodeMirror loading |

## 8. Glossary

- **WYSIWYG** — "what you see is what you get"; the editor shows the
  final rendered form while editing.
- **MathLive** — open-source visual equation editor Web Component.
- **KaTeX** — fast math typesetting library; the project's renderer.
- **ProseMirror / TipTap** — schema-based rich-text editor toolkit;
  TipTap is the React-friendly wrapper.
- **Node-view** — a custom React/DOM rendering for a ProseMirror node.
- **mdast** — the Markdown AST produced by `remark`.
- **Round-trip** — `markdownToDoc(docToMarkdown(doc))` reproduces `doc`.
- **Render-equivalence** — `render(docToMarkdown(doc))` produces the same
  HTML as `render(originalMd)` through the canonical pipeline.

## 9. How to execute

- Phases are ordered; **complete and verify each before the next.**
- Within a phase, stages are mostly sequential; steps use `- [ ]`
  checkboxes — tick them as you go.
- Every phase ends with an **Acceptance criteria** section. Do not
  proceed until all criteria pass.
- Phase 1 is the foundation and the highest-leverage correctness work —
  it ships as pure, fully-tested functions **before any UI exists**.

## 10. Whole-feature acceptance criteria

The feature is done when **all** of the following hold:

1. A teacher can create a new problem entirely in the WYSIWYG surface,
   inserting at least one inline and one display formula via the toolbar,
   never typing LaTeX, and save it.
2. Opening any existing (bulk-imported) problem for edit loads its body
   faithfully into the WYSIWYG surface; saving with no edits produces
   `body_md` that **renders identically** to the original (byte-for-byte
   whitespace differences allowed).
3. The "Manba" toggle shows the exact `body_md`, edits there reflect back
   into the visual surface, and a malformed source keeps the user safely
   in source mode with a clear error.
4. `npx tsc --noEmit`, `npm run lint`, and `npm run smoke` (including the
   new `wysiwyg-smoke.ts`) all pass.
5. Import, DOCX export, public render, and search are untouched and still
   pass their existing smokes.
