"use client";

/**
 * STUB — Phase 2 will implement KaTeX rendering aligned with markdown-preview.tsx.
 *
 * KaTeX config to mirror (from markdown-preview.tsx which uses rehype-katex defaults):
 *   rehypeKatex is called with NO explicit options object → all defaults apply:
 *     throwOnError: false  (errors render as red text, not exceptions)
 *     displayMode:  false  (controlled per-node via the mathDisplay vs mathInline distinction)
 *     strict:       "warn" (default — permissive)
 *     macros:       {}     (none defined)
 *
 * For direct katex.renderToString calls use:
 *   katex.renderToString(latex, { throwOnError: false, displayMode, strict: "warn" })
 */

export interface KatexRenderProps {
  latex: string;
  displayMode?: boolean;
  className?: string;
}

export function KatexRender(_props: KatexRenderProps) {
  return null;
}
