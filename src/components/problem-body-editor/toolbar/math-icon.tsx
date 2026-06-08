"use client";

/**
 * MathIcon — a real KaTeX-rendered glyph for a toolbar button, MathType/Word
 * Equation style. Instead of an approximate unicode glyph ("a⁄b", "xⁿ"), each
 * button shows the actual notation rendered by KaTeX, with the template's
 * placeholders (`#0`, `#1`, `#@`, `#?`) drawn as empty boxes (`□`) — exactly how
 * MathType's palettes preview a template.
 *
 * Rendering is memoised in a module-level cache keyed by the source latex, so
 * even though a popover may hold dozens of buttons (and the toolbar 20+
 * triggers) each unique formula is rendered through KaTeX at most once.
 *
 * Requires `katex/dist/katex.min.css`, already loaded by the problems segment
 * layout (`src/app/admin/problems/layout.tsx`). Falls back to a plain-text
 * glyph if KaTeX can't render the input.
 */

import katex from "katex";

const cache = new Map<string, string>();

/** Toolbar placeholders → an empty box, MathType-style. */
function placeholderToBox(latex: string): string {
  return latex.replace(/#[0-9@?]/g, "\\square");
}

/** Render once, cache the HTML (or "" on failure). */
function renderIcon(latex: string): string {
  const cached = cache.get(latex);
  if (cached !== undefined) return cached;
  let html = "";
  try {
    html = katex.renderToString(placeholderToBox(latex), {
      throwOnError: false,
      displayMode: false,
      strict: "ignore",
    });
    if (html.toLowerCase().includes("katex-error")) html = "";
  } catch {
    html = "";
  }
  cache.set(latex, html);
  return html;
}

export interface MathIconProps {
  /** Source latex (with optional `#n` placeholders). */
  latex: string;
  /** Plain-text glyph shown if KaTeX can't render `latex`. */
  fallback?: string;
  className?: string;
}

export function MathIcon({ latex, fallback, className }: MathIconProps) {
  const html = latex ? renderIcon(latex) : "";
  if (!html) {
    return (
      <span aria-hidden className={className}>
        {fallback ?? ""}
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={className}
      // KaTeX output of a known, fixed input — safe markup.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
