import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import { cn } from "@/lib/utils";

/**
 * Schema for rehype-sanitize that whitelists what KaTeX and rehype-highlight
 * emit. Without this:
 * - KaTeX's <span class="katex">… markup gets stripped and math doesn't render
 * - Highlight.js's per-token <span class="hljs-keyword"> gets flattened
 *
 * We start from the safe defaults and *add* permissions on top — never
 * remove anything from defaultSchema.
 */
/**
 * Whitelist the tags + attributes KaTeX emits. The full set was derived
 * by running every common LaTeX construct through `katex.renderToString`
 * (see scripts/markdown-smoke.ts) and diffing against what survived a
 * default-schema sanitize pass — see commit 27ccbb4 and follow-up. Each
 * entry below documents which TeX feature relies on it, so future audits
 * can tell at a glance why the attribute is allowed.
 *
 * Security: every tag here is either MathML or a tightly-scoped SVG
 * primitive (`svg`, `path`, `line`). None can execute JavaScript and
 * the attributes are descriptive only — no `on*`, `href`, or
 * `xlink:href`. The sanitize default still blocks `<script>`,
 * `javascript:` URLs, and event-handler attributes (locked by the XSS
 * tests in scripts/markdown-smoke.ts).
 */
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // Allow class on every element (KaTeX & hljs lean on this heavily).
    "*": [
      ...(defaultSchema.attributes?.["*"] ?? []),
      "className",
      "style",
      "aria-hidden",
    ],
    span: [
      ...(defaultSchema.attributes?.span ?? []),
      "className",
      "style",
      "aria-hidden",
      // KaTeX adds a `title=` on the `.katex-error` span when a parse
      // fails, so authors can hover and see the underlying error.
      "title",
    ],
    div: [
      ...(defaultSchema.attributes?.div ?? []),
      "className",
      "style",
      "aria-hidden",
    ],
    // ---- MathML (KaTeX's accessibility tree) --------------------------
    math: ["xmlns", "display"],
    annotation: ["encoding"],
    // \mathbb / \mathfrak / \mathcal / \mathit set mathvariant on <mi>;
    // operators like \neq / \approx use it for variants too.
    mi: ["mathvariant"],
    // \left( \frac{a}{b} \right) etc. — fence/stretchy/minsize control
    // how delimiters scale; separator marks commas in sequences.
    mo: ["fence", "stretchy", "minsize", "mathvariant", "separator"],
    // \binom and \atop render with linethickness=0; \frac uses default.
    mfrac: ["linethickness"],
    // \overrightarrow{AB}, \hat{x}, \widehat{abc} — `accent=true` makes
    // the overscript narrow; without it the accent floats too high.
    mover: ["accent"],
    // \underbrace, \underline — symmetric pair to mover.
    munder: ["accentunder"],
    // Combined: \overset / \underset / \xrightarrow scripts on the same
    // base.
    munderover: ["accent", "accentunder"],
    // \cancel{x}, \boxed{x} — `notation` is "updiagonalstrike" / "box".
    menclose: ["notation"],
    // Spacing (\, \! \hspace) and column structure inside matrices.
    mpadded: ["width", "lspace", "height", "depth"],
    mspace: ["width", "height", "depth"],
    // \color{red}{x^2} → mathcolor; \displaystyle / \scriptstyle
    // switches lift via scriptlevel + displaystyle.
    mstyle: ["scriptlevel", "displaystyle", "mathcolor", "mathbackground"],
    // \begin{pmatrix} ... → row/column spacing and alignment.
    mtable: ["rowspacing", "columnspacing", "columnalign", "rowalign"],
    mtr: ["columnalign", "rowalign"],
    mtd: ["columnalign", "rowalign"],
    // ---- SVG primitives KaTeX draws into ------------------------------
    // Radicals, stretchy arrows, integrals, braces all emit <svg><path>.
    // Long arrows (\xrightarrow) and \cancel additionally use <line>.
    svg: [
      "xmlns",
      "width",
      "height",
      "viewBox",
      "preserveAspectRatio",
      "fill",
      "stroke",
      "className",
      "style",
      "aria-hidden",
    ],
    path: ["d", "fill", "stroke", "strokeWidth", "className", "style"],
    line: [
      "x1",
      "y1",
      "x2",
      "y2",
      "stroke",
      "strokeWidth",
      "stroke-width",
      "className",
      "style",
    ],
  },
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    // ---- MathML ------------------------------------------------------
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
    "mover",
    "munder",
    "munderover",
    "mpadded",
    "mstyle",
    "menclose",
    "annotation",
    "semantics",
    // ---- SVG ---------------------------------------------------------
    "svg",
    "path",
    "line",
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
        // Tailwind Typography plugin (loaded via @plugin in globals.css)
        "prose prose-slate max-w-none dark:prose-invert",
        // Display math: room to breathe + horizontal scroll on narrow screens
        "[&_.katex-display]:my-4 [&_.katex-display]:overflow-x-auto",
        // Responsive images
        "[&_img]:max-w-full [&_img]:rounded-md [&_img]:border",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        // Sanitize must run AFTER katex/highlight so it sees their output
        // and can be permitted by our schema; running it first would strip
        // the markdown source itself.
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
