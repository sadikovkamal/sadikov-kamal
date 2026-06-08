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
 * `fit`: when set, the rendered formula is auto-scaled DOWN (never up) to fit
 * fully inside its parent button. Tall structures — sums/integrals with
 * over/under limits, matrices, cases — would otherwise overflow a fixed cell
 * and get clipped. The cell size is the "designated area"; this guarantees the
 * whole icon is visible within it.
 *
 * Requires `katex/dist/katex.min.css`, already loaded by the problems segment
 * layout (`src/app/admin/problems/layout.tsx`). Falls back to a plain-text
 * glyph if KaTeX can't render the input.
 */

import { useLayoutEffect, useRef, useState } from "react";
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
  /** Auto-scale the formula down to fit fully inside the parent button. */
  fit?: boolean;
}

export function MathIcon({ latex, fallback, className, fit = false }: MathIconProps) {
  const html = latex ? renderIcon(latex) : "";
  if (!html) {
    return (
      <span aria-hidden className={className}>
        {fallback ?? ""}
      </span>
    );
  }
  if (fit) return <FitGlyph html={html} className={className} />;
  return (
    <span
      aria-hidden
      className={className}
      // KaTeX output of a known, fixed input — safe markup.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * Renders the KaTeX html and scales it to fit its parent box. The natural
 * (unscaled) size is read from layout — `transform` doesn't affect
 * `offsetWidth/Height` — so the scale is computed against the real glyph size
 * and re-evaluated whenever the parent resizes.
 */
function FitGlyph({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;

    const measure = () => {
      const cw = el.offsetWidth;
      const ch = el.offsetHeight;
      const pw = parent.clientWidth;
      const ph = parent.clientHeight;
      if (!cw || !ch || !pw || !ph) return;
      // Leave a 2px breathing margin on each axis; never scale UP.
      const next = Math.min(1, (pw - 3) / cw, (ph - 3) / ch);
      setScale(next > 0 ? next : 1);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [html]);

  return (
    <span
      ref={ref}
      aria-hidden
      className={className}
      style={{
        display: "inline-block",
        transform: scale < 1 ? `scale(${scale})` : undefined,
        transformOrigin: "center",
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
