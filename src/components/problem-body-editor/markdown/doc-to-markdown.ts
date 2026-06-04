/**
 * docToMarkdown — ProseMirror/TipTap JSON document → body_md.
 *
 * We control every node type in our closed grammar, so a hand-written
 * serializer is the most predictable choice (a generic md stringifier may
 * reflow or escape unexpectedly). Escaping is explicit (see ./escape).
 *
 * Mapping:
 *   doc          → block serializations joined by a blank line (`\n\n`)
 *   paragraph    → concatenated inline children
 *   text         → escapeMarkdownText(text)
 *   mathInline   → `$` + latex + `$`            (latex verbatim)
 *   mathDisplay  → `$$` + latex + `$$`          (own block, latex verbatim)
 *   image        → `![alt](src)`
 *
 * ── Why single-line `$$...$$` for display math (Phase 0 spike) ──────────────
 * remark-math renders a single-line `$$x$$` as INLINE KaTeX (`math-inline`
 * class → displayMode:false), but a multi-line `$$\nx\n$$` as DISPLAY KaTeX
 * (`math-display` → displayMode:true). The corpus authors display math
 * exclusively as single-line `$$...$$`, so we must EMIT the single-line form
 * to keep render-equivalence: the saved text renders byte-identically to the
 * source. Re-parsing `$$x$$` yields an `inlineMath` node which markdownToDoc
 * promotes back to a `mathDisplay` block by inspecting the `$$` delimiter, so
 * the round-trip is structurally stable too.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The document ends WITHOUT a trailing newline (matching the importer's
 * `.trim()` convention). An empty document serialises to `""`.
 */

import type { JSONContent } from "@tiptap/core";
import { escapeMarkdownText } from "./escape";

/** Convert a TipTap JSON document back to a body_md string. */
export function docToMarkdown(doc: JSONContent): string {
  const blocks = doc.content ?? [];
  const parts: string[] = [];

  for (const block of blocks) {
    const serialized = serializeBlock(block);
    if (serialized !== null) parts.push(serialized);
  }

  return parts.join("\n\n");
}

/** Serialize one block node; returns null for blocks that emit nothing. */
function serializeBlock(node: JSONContent): string | null {
  switch (node.type) {
    case "paragraph": {
      const text = serializeInline(node.content ?? []);
      // Drop a truly empty paragraph rather than emitting a blank block, which
      // would otherwise survive a re-parse as nothing and break stability.
      return text.length > 0 ? text : null;
    }
    case "mathDisplay": {
      const latex = String(node.attrs?.latex ?? "");
      // Never emit a bare `$$` for an empty formula — it would re-parse as a
      // display delimiter and corrupt the surrounding text. Drop empties.
      if (latex.trim() === "") return null;
      // Single-line form — see header note on render-equivalence.
      return `$$${latex}$$`;
    }
    case "image": {
      const src = String(node.attrs?.src ?? "");
      const alt = String(node.attrs?.alt ?? "");
      return `![${alt}](${src})`;
    }
    default:
      return null;
  }
}

/** Concatenate a paragraph's inline children into a markdown string. */
function serializeInline(nodes: JSONContent[]): string {
  let out = "";
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        out += escapeMarkdownText(node.text ?? "");
        break;
      case "mathInline": {
        const latex = String(node.attrs?.latex ?? "");
        // Skip empty inline formulas — a bare `$$` would re-parse wrongly.
        if (latex.trim() !== "") out += `$${latex}$`;
        break;
      }
      default:
        // Unknown inline node: ignore (closed grammar should never reach here).
        break;
    }
  }
  return out;
}
