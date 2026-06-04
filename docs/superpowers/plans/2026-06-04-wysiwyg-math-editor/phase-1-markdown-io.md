# Phase 1 — Markdown I/O Core (pure functions, no UI)

> **Goal:** Ship the correctness foundation: a **locked editor schema**
> and a **lossless** `body_md` ⇄ ProseMirror-document pair, fully unit-
> tested against the real corpus — **before any UI exists**.
>
> **Depends on:** Phase 0 (corpus fixture, deps, canonical KaTeX config).
> **Blocks:** Phases 2–5 (every UI piece builds on this schema + I/O).
> **Deliverables:** `schema/*`, `markdown/markdown-to-doc.ts`,
> `markdown/doc-to-markdown.ts`, `markdown/escape.ts`,
> `scripts/wysiwyg-smoke.ts`.

This is the highest-leverage correctness work in the whole plan. If the
round-trip is provably lossless here, every later phase is "just UI" on
top of a trusted data layer.

---

## Stage 1.1 — Define the locked editor schema

We compose a **minimal** TipTap extension set. No StarterKit. The schema
*cannot* represent anything outside our grammar, which is what guarantees
round-trip fidelity.

### Step 1.1.1 — Document, paragraph, text
- [ ] `schema/extensions.ts` assembles the extension array:
  ```ts
  import Document from "@tiptap/extension-document";
  import Paragraph from "@tiptap/extension-paragraph";
  import Text from "@tiptap/extension-text";
  import History from "@tiptap/extension-history";
  import Gapcursor from "@tiptap/extension-gapcursor";
  import Dropcursor from "@tiptap/extension-dropcursor";
  import { MathInline } from "./math-inline";
  import { MathDisplay } from "./math-display";
  import { ImageNode } from "./image";

  export const editorExtensions = [
    Document, Paragraph, Text,
    MathInline, MathDisplay, ImageNode,
    History, Gapcursor, Dropcursor,
  ];
  ```
- [ ] Confirm `Document`'s default `content` expression permits our block
      set. If needed, override the top node `content` to
      `"(paragraph | mathDisplay | image)+"`.

### Step 1.1.2 — `MathInline` node spec
- [ ] `schema/math-inline.ts`:
  ```ts
  export const MathInline = Node.create({
    name: "mathInline",
    group: "inline",
    inline: true,
    atom: true,            // edited as a unit via node-view, not char-by-char
    selectable: true,
    addAttributes() {
      return { latex: { default: "" } };
    },
    // Serialized form for ProseMirror's own clipboard/DOM (not our md I/O):
    parseHTML() { return [{ tag: 'span[data-math-inline]' }]; },
    renderHTML({ node }) {
      return ["span", { "data-math-inline": "", "data-latex": node.attrs.latex }];
    },
    // React node-view comes in Phase 2.
  });
  ```
- [ ] Keep the DOM (`renderHTML`) representation **carry the LaTeX in a
      data attribute** so ProseMirror's internal copy/paste survives even
      before the node-view exists.

### Step 1.1.3 — `MathDisplay` node spec
- [ ] `schema/math-display.ts`: same as inline but
      `group: "block"`, `inline: false`, `atom: true`,
      `parseHTML → div[data-math-display]`.

### Step 1.1.4 — `Image` node spec
- [ ] `schema/image.ts`: block atom with `src` + `alt` attributes,
      `parseHTML → img[src]`, `renderHTML → ["img", { src, alt }]`.
      (We author our own minimal image node rather than `@tiptap/extension-image`
      to keep the schema closed and the markdown mapping explicit.)

**Verification:** an `Editor` built from `editorExtensions` instantiates
in a unit test (no DOM features exercised yet); inserting a `mathInline`
node programmatically and reading `editor.getJSON()` yields the expected
shape.

---

## Stage 1.2 — `markdownToDoc` (body_md → ProseMirror JSON)

Parse with the **same tokenizer the canonical renderer uses** so math
boundaries are identical. `remark-parse` + `remark-math` produce an mdast;
we walk that small mdast into a ProseMirror document JSON.

### Step 1.2.1 — Parse to mdast
- [ ] `markdown/markdown-to-doc.ts`:
  ```ts
  import { unified } from "unified";
  import remarkParse from "remark-parse";
  import remarkMath from "remark-math";

  const processor = unified().use(remarkParse).use(remarkMath);
  // processor.parse(md) → mdast Root
  ```
- [ ] Note: `remark-math` adds `inlineMath` (phrasing) and `math` (block)
      node types with a `.value` LaTeX string.

### Step 1.2.2 — Walk mdast → ProseMirror JSON
- [ ] Map only the node types our grammar contains; everything else is a
      **defensive fallback** (turn unknown phrasing into its text via
      `mdast-util-to-string`, unknown blocks into a paragraph) so a
      surprise never throws:

  | mdast node | → ProseMirror |
  |---|---|
  | `root` | `doc` with block children |
  | `paragraph` (text/inlineMath only) | `paragraph` with inline children |
  | `paragraph` whose **only** meaningful child is an `image` | a block `image` node (promoted out of the paragraph) |
  | `text` | `{ type: "text", text }` |
  | `inlineMath` | `{ type: "mathInline", attrs: { latex: value } }` |
  | `math` (block) | `{ type: "mathDisplay", attrs: { latex: value } }` |
  | `image` (standalone) | `{ type: "image", attrs: { src: url, alt } }` |
  | anything else | text fallback (logged in dev) |

- [ ] **Image promotion rule:** the importer emits images on their own
      line, so they parse as a paragraph containing one `image`. Detect
      "paragraph whose children are an image (plus optional whitespace
      text)" and emit a top-level `image` block instead of a paragraph.
      If a paragraph mixes real text **and** an image, split it: text
      stays a paragraph, the image becomes a following `image` block.
      (Document this; it is the one structural normalization.)

> **CRITICAL FINDING (Phase 0 spike, 2026-06-04):** remark-math v6 parses
> a **single-line** `$$...$$` block (the common form in our corpus — 6 of
> 81 expressions) as an **`inlineMath`** node, NOT a block `math` node.
> Therefore **inline-vs-display MUST be decided by the source delimiter
> (`$$` → display, `$` → inline), not by the mdast node type.**
> Implementation guidance:
> - When walking `inlineMath` nodes, inspect the original source span
>   (mdast `node.position` → slice the source) to detect whether the
>   delimiter was `$$` (→ emit `mathDisplay`) or `$` (→ emit `mathInline`).
> - FIRST empirically confirm how the canonical `markdown-preview.tsx`
>   pipeline renders a single-line `$$...$$` (inline vs centered display)
>   and make both the editor node-view (Phase 2) AND serialization
>   consistent with it. The render-equivalence test (Stage 1.4) is the
>   final arbiter.
> - `docToMarkdown` must emit `mathDisplay` using the SAME `$$` form the
>   corpus uses so re-parsing is stable.

### Step 1.2.3 — Handle empty / whitespace input
- [ ] Empty `body_md` → a doc with a single empty `paragraph` (ProseMirror
      requires at least one block; the top node content is `+`).
- [ ] Collapse the soft line-wraps inside a paragraph the way markdown
      does (single newline = space) — `remark` already represents a
      soft-wrapped paragraph as one `paragraph` with `text` (newlines
      normalized), so this is automatic. Verify on a wrapped corpus body.

### Step 1.2.4 — Return type
- [ ] Export `markdownToDoc(md: string): JSONContent` (TipTap's
      `JSONContent`). Pure function, no DOM, no React — runnable in the
      smoke script under Node.

**Verification:** unit cases — plain paragraph; paragraph with inline
math; a `$$display$$` block; a standalone image; a paragraph followed by
an image; empty string. Each yields the expected `JSONContent`.

---

## Stage 1.3 — `doc-to-markdown` (ProseMirror JSON → body_md)

Serialize our tiny grammar directly, with explicit escaping. We control
every node type, so a hand-written serializer is the most predictable
choice (vs. a generic md stringifier that may reflow/escape unexpectedly).

### Step 1.3.1 — Escaping helpers
- [ ] `markdown/escape.ts`:
  - [ ] `escapeText(s)` — escape characters that would otherwise be parsed
        as markdown **or** as math: a literal `$` → `\$`, leading `![` /
        `[` image/link syntax, leading `#`, backslash. Keep the set
        **minimal** but sufficient that `markdownToDoc(escapeText(x))`
        round-trips `x` as plain text. Unit-test this directly.
  - [ ] Math `latex` strings are emitted **verbatim** between delimiters —
        never escaped (LaTeX backslashes are meaningful).

### Step 1.3.2 — Serialize nodes
- [ ] `markdown/doc-to-markdown.ts` walks `JSONContent`:

  | ProseMirror node | → markdown |
  |---|---|
  | `doc` | join block serializations with a blank line (`\n\n`) |
  | `paragraph` | concatenate inline children |
  | `text` | `escapeText(text)` |
  | `mathInline` | `` `$${latex}$` `` → `$` + latex + `$` |
  | `mathDisplay` | `$$\n` + latex + `\n$$` (own block) |
  | `image` | `![${alt ?? ""}](${src})` |

- [ ] **Inline math spacing:** ensure a space or boundary exists so the
      emitted `$...$` re-tokenizes as math under remark-math (remark-math
      treats `a$x$b` carefully). Mirror whatever the canonical renderer
      requires; the render-equivalence test (1.4) is the guard.
- [ ] Trim trailing whitespace per line; ensure the document ends without
      a trailing newline (match the importer's `.trim()` convention so a
      no-op edit of imported data is minimal).

### Step 1.3.3 — Return type
- [ ] Export `docToMarkdown(doc: JSONContent): string`. Pure, Node-safe.

**Verification:** unit cases mirror 1.2.4 in reverse; plus a text node
containing a literal `$` serializes to `\$` and parses back to the same
text.

---

## Stage 1.4 — Round-trip + render-equivalence smoke test

This is the proof the data layer is safe. It runs in CI/locally and gates
the whole feature.

### Step 1.4.1 — Author `scripts/wysiwyg-smoke.ts`
- [ ] Load `scripts/fixtures/wysiwyg-corpus.json`.
- [ ] For each `{ code, bodyMd }`:
  - [ ] **Round-trip (structural):**
        `const doc = markdownToDoc(bodyMd);`
        `const md2 = docToMarkdown(doc);`
        `const doc2 = markdownToDoc(md2);`
        assert `doc2` deep-equals `doc` (the document is *stable* — a
        second pass changes nothing). This tolerates whitespace reflow
        while proving semantic stability.
  - [ ] **Render-equivalence (canonical):** render `bodyMd` and `md2`
        through the **same pipeline** [`markdown-preview.tsx`](../../../../src/components/markdown-preview.tsx) uses
        (`remark-gfm` + `remark-math` + `rehype-katex` + sanitize) to HTML
        strings; normalize whitespace; assert equal. This proves the saved
        text renders identically to the original.
- [ ] Print a summary: `N tested, N round-trip-stable, N render-equal`,
      and list any failures with the `code` for triage.

### Step 1.4.2 — Wire it into the smoke runner
- [ ] Register `wysiwyg-smoke.ts` in
      [`scripts/run-all-smokes.sh`](../../../../scripts/run-all-smokes.sh). Decide its conditions flag:
      it imports the canonical render pipeline (which uses
      `react-dom/server` indirectly via react-markdown). Match whatever
      flag [`markdown-smoke.ts`](../../../../scripts/markdown-smoke.ts) uses (it renders markdown the same
      way) — likely **without** `--conditions=react-server`. Confirm by
      running both ways.
- [ ] Update the README smoke table in the repo root
      [`README.md`](../../../../README.md) with the new script row.

### Step 1.4.3 — Triage and fix until green
- [ ] Run; for each failure, fix `markdownToDoc`/`docToMarkdown`/`escape`
      (not the fixture). Failures here are exactly the bugs we want to
      catch before any UI exists.
- [ ] If a specific real LaTeX expression is the culprit, cross-reference
      `COMPAT-REPORT.md` — render-equivalence failures driven by KaTeX
      itself (not our I/O) are out of our scope and noted.

**Verification:** `tsx scripts/wysiwyg-smoke.ts` (with the right flags)
reports 100% round-trip-stable and 100% render-equal across the corpus.

---

## Phase 1 — Acceptance criteria

- [ ] `editorExtensions` compose a closed schema (`doc → (paragraph |
      mathDisplay | image)+`, `paragraph → (text | mathInline)*`).
- [ ] `markdownToDoc` and `docToMarkdown` are pure, typed, Node-safe.
- [ ] Unit tests for both directions pass, including the literal-`$`
      escaping case.
- [ ] `scripts/wysiwyg-smoke.ts` reports **100% round-trip-stable** and
      **100% render-equal** over the real corpus, and is registered in the
      smoke runner.
- [ ] `npx tsc --noEmit` and `npm run lint` are clean.

> **Gate:** UI phases (2–5) may not begin until the smoke test is green on
> real data. The whole architecture's safety rests on this stage.
