# Phase 0 — Preflight Notes

Recorded 2026-06-04. All version numbers are the **actually installed** values.

---

## 1. Next.js 16 — `next/dynamic` with `ssr: false`

**Source:** `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`

The pattern used today in `src/components/problem-form.tsx` is valid and unchanged in Next 16:

```ts
// Must be inside a "use client" file
const MarkdownEditor = dynamic(
  () => import("@/components/markdown-editor").then((m) => m.MarkdownEditor),
  { ssr: false, loading: () => <div>Loading editor…</div> }
);
```

Key facts from the docs:
- `ssr: false` **only works inside a Client Component** (`"use client"` file). If called from a Server Component the build will error: *"ssr: false is not allowed with next/dynamic in Server Components."*
- `problem-form.tsx` is already `"use client"` so the pattern carries over unchanged.
- MathLive (Web Component) and the TipTap editor surface must both be loaded via `dynamic(..., { ssr: false })` for the same reason — they register browser-only DOM APIs at import time.
- `"use client"` marks a **boundary** in the module graph; all imports below that boundary are automatically part of the client bundle. No need to add the directive to every child component.
- Named exports: use `.then((m) => m.ExportName)` inside the `dynamic()` call (already the pattern in the codebase).

No breaking changes from typical Next.js 14/15 knowledge for this feature.

---

## 2. TipTap — installed version, import paths, Node.create, ReactNodeViewRenderer

**Installed:** `@tiptap/react@3.25.0`, `@tiptap/core@3.25.0`, `@tiptap/pm@3.25.0`, `@tiptap/extensions@3.25.0`, `@tiptap/extension-document@3.25.0`, `@tiptap/extension-paragraph@3.25.0`, `@tiptap/extension-text@3.25.0`

### Package layout change vs v2

In **TipTap v3**, `History`, `Gapcursor`, and `Dropcursor` moved **out of separate packages** and into the consolidated `@tiptap/extensions` package. The old `@tiptap/extension-history` still exists as a separate package at v3.25.0 but it is now a thin re-export; the preferred import is via `@tiptap/extensions`.

| Extension | v2 import | v3 import (canonical) |
|---|---|---|
| Document | `@tiptap/extension-document` | `@tiptap/extension-document` (unchanged) |
| Paragraph | `@tiptap/extension-paragraph` | `@tiptap/extension-paragraph` (unchanged) |
| Text | `@tiptap/extension-text` | `@tiptap/extension-text` (unchanged) |
| History/UndoRedo | `@tiptap/extension-history` | `@tiptap/extensions` → `UndoRedo` |
| Gapcursor | `@tiptap/extension-gapcursor` | `@tiptap/extensions` → `Gapcursor` |
| Dropcursor | `@tiptap/extension-dropcursor` | `@tiptap/extensions` → `Dropcursor` |

### Correct import paths (v3.25.0)

```ts
import { Document } from '@tiptap/extension-document';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Text } from '@tiptap/extension-text';
// Consolidated in @tiptap/extensions:
import { UndoRedo, Gapcursor, Dropcursor } from '@tiptap/extensions';
// Or sub-path imports:
import { UndoRedo } from '@tiptap/extensions/undo-redo';
import { Gapcursor } from '@tiptap/extensions/gap-cursor';
import { Dropcursor } from '@tiptap/extensions/drop-cursor';
```

### Custom Node with `Node.create`

```ts
import { Node } from '@tiptap/core';

const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return { latex: { default: '' } };
  },
  parseHTML() { return [{ tag: 'span[data-math-inline]' }]; },
  renderHTML({ node }) {
    return ['span', { 'data-math-inline': '', 'data-latex': node.attrs.latex }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(MathNodeView);
  },
});
```

### React Node Views

```ts
import { ReactNodeViewRenderer } from '@tiptap/react';

// Inside Node.create:
addNodeView() {
  return ReactNodeViewRenderer(MyReactComponent);
},
```

The React component receives `NodeViewProps` from `@tiptap/react` (includes `node`, `editor`, `selected`, `updateAttributes`, etc.).

```ts
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';

function MathNodeView({ node, updateAttributes, selected }: NodeViewProps) {
  return (
    <NodeViewWrapper>
      {/* render KaTeX or MathLive here */}
    </NodeViewWrapper>
  );
}
```

---

## 3. MathLive — `<math-field>` API

**Installed:** `mathlive@0.109.2`

MathLive registers the `<math-field>` custom element when imported. Load with `dynamic(..., { ssr: false })`.

### Read / Write value

```ts
const el = document.querySelector('math-field') as MathfieldElement;
const latex = el.getValue('latex');      // read — returns LaTeX string
el.setValue('\\frac{a}{b}');            // write — replaces content
```

### Events

| Event name | When it fires |
|---|---|
| `input` | On every keystroke / change — use this for live `onChange` sync |
| `change` | When user commits (blur or Enter) |
| `selection-change` | Caret / selection moved |
| `undo-state-change` | Undo stack changed |

Use `"input"` for continuous updates (analogous to `<input oninput>`):

```ts
el.addEventListener('input', () => {
  onChange(el.getValue('latex'));
});
```

### Virtual keyboard

```ts
el.mathVirtualKeyboardPolicy = 'manual';  // prevent auto-show; control explicitly
el.mathVirtualKeyboardPolicy = 'auto';    // default: show on mobile, hide on desktop
el.mathVirtualKeyboardPolicy = 'sandboxed'; // scoped to the element's shadow DOM
```

### Placeholder / template syntax

MathLive uses `#0`, `#1`, … as tab-stop placeholders in template LaTeX strings, e.g.:
```
\frac{#0}{#1}   — numerator (#0) and denominator (#1)
\sqrt{#0}
x^{#0}
```

---

## 4. KaTeX — canonical config from `markdown-preview.tsx`

**Installed:** `katex@0.16.45`

`markdown-preview.tsx` calls `rehype-katex` with **no explicit options object**:

```tsx
rehypePlugins={[rehypeKatex, rehypeHighlight, [rehypeSanitize, sanitizeSchema]]}
```

`rehype-katex` defaults (as of `rehype-katex@7.0.1`) are identical to KaTeX defaults:

| Option | Default | Notes |
|---|---|---|
| `throwOnError` | `false` | Errors render as red `\KaTeX error` text, not exceptions |
| `displayMode` | `false` | Inline by default; rehype-katex sets `true` for `$$` blocks automatically |
| `strict` | `"warn"` | Permits unknown commands with a warning |
| `macros` | `{}` | No custom macros defined |
| `output` | `"htmlAndMathml"` | Both HTML and MathML accessibility tree |

### Direct `katex.renderToString` to mirror this config

```ts
import katex from 'katex';

const html = katex.renderToString(latex, {
  throwOnError: false,
  displayMode: false,   // true for mathDisplay nodes
  strict: 'warn',
  // macros: {}         // no macros — mirror the preview exactly
});
```

For **display math** nodes, pass `displayMode: true`.

The sanitize schema in `markdown-preview.tsx` allows KaTeX's MathML + SVG output — the editor renders inside the app (not via react-markdown), so sanitization is not needed for the node-view render.

---

## 5. Round-trip caveat — canonical vs. non-canonical `body_md`

(Recorded after the final code review.)

The round-trip is **byte-stable on the first pass** for `body_md` in the
editor's *canonical* form — which is exactly what the bulk importer
produces and what the entire stored corpus uses (plain text + inline
`$...$` + single-line `$$...$$` with any trailing punctuation INSIDE the
delimiters + `![alt](url)`). The smoke proves 66/66 stable + render-equal.

**Non-canonical** markdown (not produced by our pipeline) is normalized on
the *first* edit pass and may therefore render slightly differently the
first time it is opened in the editor — but it is always **stable**
afterwards (reaches a fixpoint; never drifts). Known cases, all guarded by
the "non-canonical input reaches a stable fixpoint" assertions in
`scripts/wysiwyg-smoke.ts`:

- Trailing punctuation **outside** display delimiters: `$$x$$.` → the `.`
  becomes its own block.
- Inline code spans (`` `code` ``) — not in the locked grammar → flattened
  to plain text.
- Raw inline HTML (`<b>…</b>`) → escaped to literal text.
- Mid-sentence `$$…$$` → promoted to a block, splitting the sentence
  (leaves boundary whitespace that the next parse trims, so this case
  reaches its fixpoint on the second pass rather than the first — still
  bounded, never drifting).

This is a non-issue in practice because all stored bodies are canonical.
Note also that the source→visual guard (`source-mode/guard.ts`) does NOT
warn on these (they contain no unclosed math); it only blocks genuinely
malformed/untokenizable math.
