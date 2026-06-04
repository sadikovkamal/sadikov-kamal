"use client";

/**
 * KaTeX render helper for the math node-views.
 *
 * Mirrors the canonical preview config in markdown-preview.tsx, which calls
 * rehype-katex with NO explicit options object → all KaTeX defaults apply:
 *   throwOnError: false  (errors render as red .katex-error text, not exceptions)
 *   strict:       "warn" (permissive — unknown commands warn, don't throw)
 *   macros:       {}     (none — must NOT define any, to stay byte-equal)
 *
 * The only per-call knob is `displayMode`. See DISPLAY_MATH_MODE below for why
 * mathDisplay nodes are rendered with displayMode:false to match the saved page.
 */

import katex from "katex";

/**
 * displayMode used to render a `mathDisplay` node at rest.
 *
 * A `mathDisplay` node serializes to a single-line `$$...$$` (Phase 1), and the
 * canonical markdown pipeline renders that single-line form INLINE
 * (displayMode:false) — confirmed by the Phase 1 smoke (66/66 render-equal).
 * To make the editor look identical to the saved page we therefore render
 * display math with displayMode:false too (but laid out as its own block).
 *
 * Flip this single constant to `true` if the product later decides display
 * math should be centered/larger in the editor.
 */
export const DISPLAY_MATH_MODE = false;

/**
 * Render a LaTeX string to KaTeX HTML markup, mirroring markdown-preview.tsx.
 *
 * @param latex   the raw LaTeX (KaTeX-renderable; no macros)
 * @param display whether this is a display-math node (layout only — the actual
 *                KaTeX displayMode is governed by DISPLAY_MATH_MODE)
 */
export function renderKatex(latex: string, display: boolean): string {
  return katex.renderToString(latex, {
    throwOnError: false,
    displayMode: display ? DISPLAY_MATH_MODE : false,
    strict: "warn",
    // No `macros` — mirror the preview exactly.
  });
}
