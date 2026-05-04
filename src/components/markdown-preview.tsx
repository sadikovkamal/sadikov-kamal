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
    ],
    div: [
      ...(defaultSchema.attributes?.div ?? []),
      "className",
      "style",
      "aria-hidden",
    ],
    // KaTeX emits MathML alongside HTML for accessibility.
    math: ["xmlns", "display"],
    annotation: ["encoding"],
  },
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
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
