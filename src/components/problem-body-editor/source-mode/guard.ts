/**
 * Guard for the source → visual switch.
 *
 * Switching visual → source is always safe (the visual editor keeps `value`
 * serialized). The only hazard is the reverse: malformed raw markdown that the
 * tokenizer can't faithfully turn into our locked document. We never want to
 * silently drop or mangle the user's text, so before flipping to visual we
 * dry-run `markdownToDoc(value)` here and decide whether it's safe.
 *
 * Two failure shapes:
 *   • THROW — the parser blew up. Hard block.
 *   • SUSPICIOUS — it returned, but the source clearly contained math (`$`)
 *     while the produced document has zero math nodes. That means the math
 *     didn't tokenize (e.g. an unclosed `$`) and fell back to plain text;
 *     flipping to visual would visibly lose the formula, so we block too.
 */

import type { JSONContent } from "@tiptap/core";
import { markdownToDoc } from "../markdown/markdown-to-doc";

export type GuardResult =
  | { ok: true; doc: JSONContent }
  | { ok: false; reason: "throw" | "suspicious" };

/** Does the document contain at least one math node (inline or display)? */
function hasMathNode(doc: JSONContent): boolean {
  let found = false;
  const walk = (node: JSONContent) => {
    if (found) return;
    if (node.type === "mathInline" || node.type === "mathDisplay") {
      found = true;
      return;
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc);
  return found;
}

/**
 * Does the raw source look like it contains math? A lone `$` (e.g. a price)
 * isn't math; we require a plausible delimiter pair `$...$`. This keeps the
 * suspicious-check from firing on innocent dollar signs.
 */
function sourceLooksLikeMath(md: string): boolean {
  return /\$[^$]*\$/.test(md) || md.includes("$$");
}

/** Attempt the source → visual conversion under guard. */
export function tryEnterVisual(value: string): GuardResult {
  let doc: JSONContent;
  try {
    doc = markdownToDoc(value);
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[source-toggle] markdownToDoc threw:", err);
    }
    return { ok: false, reason: "throw" };
  }

  if (sourceLooksLikeMath(value) && !hasMathNode(doc)) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[source-toggle] source contained math delimiters but produced no math nodes — likely malformed LaTeX."
      );
    }
    return { ok: false, reason: "suspicious" };
  }

  return { ok: true, doc };
}
