# Phase 3 — Markdown and LaTeX Rendering

**Goal:** Build a reusable `<MarkdownPreview>` component that safely renders
math-heavy markdown — LaTeX (inline + display), tables, code blocks, images,
and links — using KaTeX. This is a dependency for Phase 5 (problem create UI)
and Phase 8 (bulk import preview).

**Estimated time:** Half a session (~1.5 hours)

---

## What you'll have at the end

- `<MarkdownPreview>` component renders markdown + LaTeX correctly
- KaTeX styles loaded globally
- A test sandbox page (`/admin/_test/preview`) where you can paste markdown
  and see it render live, used to validate edge cases
- HTML sanitization layer so untrusted markdown can't inject scripts
- Image rendering with proper sizing (no layout shift)

---

## Stack choices

| Need | Library | Why |
|---|---|---|
| Parse markdown | `react-markdown` | React-native, extensible via plugins |
| Math syntax | `remark-math` | Parses `$...$` and `$$...$$` into AST nodes |
| Render math | `rehype-katex` + `katex` | Server + client rendering, fast |
| Tables, strikethrough, task lists | `remark-gfm` | GitHub-flavored markdown |
| Sanitization | `rehype-sanitize` | Whitelist-based, prevents XSS |
| Code highlighting (optional) | `rehype-highlight` | For code blocks in solutions |

We don't use `react-syntax-highlighter` — it bundles all languages and
bloats the client. `rehype-highlight` is lighter for the markdown use case.

---

## Steps

### 3.1. Install dependencies

```bash
npm install react-markdown remark-math rehype-katex remark-gfm \
  rehype-sanitize rehype-highlight katex
npm install -D @types/hast
```

### 3.2. Load KaTeX CSS globally

In `src/app/layout.tsx`, add the KaTeX stylesheet:

```tsx
import "katex/dist/katex.min.css";
import "highlight.js/styles/github.css"; // or pick another theme
import "./globals.css";

// ... rest of the layout
```

If you want a dark theme for code: use `github-dark.css`. For now, pick
one that matches shadcn's default light theme.

### 3.3. The `<MarkdownPreview>` component

Create `src/components/markdown-preview.tsx`:

```tsx
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import { cn } from "@/lib/utils";

/**
 * Schema for rehype-sanitize that allows KaTeX-emitted attributes.
 * Without this, KaTeX's spans/classes get stripped and math doesn't render.
 */
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // Allow class on most elements (KaTeX uses classes heavily)
    "*": [...(defaultSchema.attributes?.["*"] || []), "className", "style"],
    // Allow KaTeX's specific attributes on math containers
    span: [
      ...(defaultSchema.attributes?.span || []),
      "className",
      "style",
      "aria-hidden",
    ],
    div: [
      ...(defaultSchema.attributes?.div || []),
      "className",
      "style",
      "aria-hidden",
    ],
    // Math semantic markup
    math: ["xmlns", "display"],
    annotation: ["encoding"],
  },
  tagNames: [
    ...(defaultSchema.tagNames || []),
    // KaTeX MathML output
    "math",
    "mrow",
    "mi",
    "mo",
    "mn",
    "msup",
    "msub",
    "msubsup",
    "mfrac",
    "msqrt",
    "mroot",
    "mtable",
    "mtr",
    "mtd",
    "mspace",
    "mtext",
    "annotation",
    "semantics",
  ],
};

export interface MarkdownPreviewProps {
  source: string;
  className?: string;
}

export function MarkdownPreview({ source, className }: MarkdownPreviewProps) {
  return (
    <div
      className={cn(
        // Tailwind Typography plugin classes for nice prose defaults
        // If you don't have @tailwindcss/typography, this is harmless;
        // see step 3.4 for installing it.
        "prose prose-slate max-w-none",
        // KaTeX needs some breathing room for display math
        "[&_.katex-display]:my-4 [&_.katex-display]:overflow-x-auto",
        // Make images responsive
        "[&_img]:max-w-full [&_img]:rounded-md [&_img]:border",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          rehypeKatex,
          rehypeHighlight,
          [rehypeSanitize, sanitizeSchema],
        ]}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
```

### 3.4. Tailwind Typography (recommended)

For nice default prose styling (headings, lists, code blocks):

```bash
npm install -D @tailwindcss/typography
```

In `tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";

export default {
  // ...existing config
  plugins: [require("@tailwindcss/typography")],
} satisfies Config;
```

### 3.5. Test sandbox page

Create `src/app/admin/_test/preview/page.tsx` (only available to admins
because it's under `/admin`):

```tsx
"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownPreview } from "@/components/markdown-preview";

const SAMPLE = `# Test problem

Let $a, b, c$ be positive reals with $a + b + c = 3$. Prove that:

$$\\sum_{cyc} \\frac{a}{b+c} \\geq \\frac{3}{2}$$

## Solution

By the Cauchy-Schwarz inequality:

$$\\left(\\sum_{cyc} \\frac{a}{b+c}\\right) \\left(\\sum_{cyc} a(b+c)\\right) \\geq (a+b+c)^2$$

| Step | Reasoning |
|------|-----------|
| 1 | Apply Cauchy-Schwarz |
| 2 | Simplify the right side |
| 3 | Conclude |

\`\`\`python
def f(n):
    return n * (n + 1) // 2
\`\`\`

- An item
- Another item with $\\sqrt{2}$ in it
- Task list:
  - [x] Done
  - [ ] Pending
`;

export default function PreviewSandbox() {
  const [source, setSource] = useState(SAMPLE);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="space-y-2">
        <h2 className="font-semibold">Markdown source</h2>
        <Textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="min-h-[600px] font-mono text-sm"
        />
      </div>
      <div className="space-y-2">
        <h2 className="font-semibold">Preview</h2>
        <div className="border rounded-md p-4 min-h-[600px]">
          <MarkdownPreview source={source} />
        </div>
      </div>
    </div>
  );
}
```

### 3.6. Edge cases to verify in the sandbox

Paste each of these and confirm correct rendering:

**Inline math next to text:**
```
The function $f(x) = x^2$ has a minimum at $x = 0$.
```

**Display math with align:**
```
$$\begin{aligned}
(a+b)^2 &= a^2 + 2ab + b^2 \\
        &= a^2 + b^2 + 2ab
\end{aligned}$$
```

**Greek letters and symbols:**
```
$\alpha + \beta = \gamma$, and $\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$.
```

**Cases environment:**
```
$$f(x) = \begin{cases} 1 & \text{if } x > 0 \\ 0 & \text{otherwise} \end{cases}$$
```

**Matrix:**
```
$$A = \begin{pmatrix} a & b \\ c & d \end{pmatrix}$$
```

**Image (use a placeholder URL for now):**
```
![Diagram](https://placehold.co/400x200)
```

**XSS attempt (must be sanitized):**
```
<script>alert('xss')</script>
[click me](javascript:alert('xss'))
<img src=x onerror=alert('xss')>
```
The script tag should not execute, the link should not have a `javascript:`
href, the img tag should not have an `onerror`.

### 3.7. Server-rendered vs client-rendered KaTeX

`rehype-katex` runs at parse time, so when the markdown is rendered on the
server (which it will be in most of our pages), the KaTeX HTML is already
present in the response. **No client-side hydration is needed for the math
itself.** The KaTeX CSS just styles the pre-rendered HTML.

This means: smaller JS bundle, faster first paint, math visible even with
JS disabled.

### 3.8. (Optional) Lazy-load for huge documents

If a problem solution has hundreds of math expressions, the server render
can get slow. For MVP this is not a concern, but note the escape hatch:
make the component a `dynamic()` import with `ssr: false` if needed later.

---

## File structure changes

```
src/
├── components/
│   └── markdown-preview.tsx        (new)
├── app/
│   ├── layout.tsx                  (modified — add KaTeX CSS)
│   └── admin/
│       └── _test/
│           └── preview/
│               └── page.tsx        (new)
└── tailwind.config.ts              (modified — typography plugin)
```

---

## Acceptance criteria

- [ ] `/admin/_test/preview` loads (after admin login) and shows the SAMPLE
      content rendered with all math, tables, code, and lists correctly
- [ ] Editing the source text updates the preview live
- [ ] All edge cases from step 3.6 render as expected
- [ ] XSS attempts in step 3.6 are neutralized (no alerts, no `javascript:` links)
- [ ] View page source — KaTeX HTML (`<span class="katex">...`) is present
      in the initial HTML, not generated client-side
- [ ] Resizing the browser window doesn't break math layout (display math
      should scroll horizontally if too wide)

---

## Common pitfalls

- **Math doesn't render, just shows raw `\frac{a}{b}`** — almost always
  the sanitizer schema is too strict. Make sure you're using the custom
  schema in step 3.3, not `defaultSchema` directly.
- **KaTeX CSS not loading** — verify `import "katex/dist/katex.min.css"`
  is in `app/layout.tsx`, not in a client component (it has to be at the
  root for SSR).
- **`\\` vs `\`** — in the markdown source string (especially in JS template
  literals), backslashes get escaped. `$$\\frac{a}{b}$$` in a JS string
  becomes `$$\frac{a}{b}$$` in the actual markdown, which is correct.
  When users type into a textarea, they type `\frac{a}{b}` directly.
- **`prose` class makes things weird** — Tailwind Typography sets a lot
  of styles. If something looks off, use `prose-sm`, `prose-lg`, or
  override specific elements with arbitrary variants.
- **Code blocks not highlighted** — `rehype-highlight` infers language
  from the fence (` ```python `). Without a language tag, no highlighting.

---

## What's next

→ [Phase 4 — R2 Storage Setup](./phase-04-r2-storage-setup.md)
