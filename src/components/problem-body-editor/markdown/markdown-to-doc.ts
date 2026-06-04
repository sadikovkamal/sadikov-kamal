/**
 * markdownToDoc — body_md → ProseMirror/TipTap JSON document.
 *
 * Parses with the SAME tokenizer the canonical renderer uses
 * (`remark-parse` + `remark-math`) so math boundaries are identical, then
 * walks the small mdast into a closed-grammar TipTap `JSONContent` document:
 *
 *   doc       → (paragraph | mathDisplay | image)+
 *   paragraph → (text | mathInline)*
 *
 * Only the node types in our grammar are mapped; anything else falls back to
 * its text content (phrasing) or a paragraph (block) so a surprise never throws.
 *
 * ── CRITICAL (Phase 0 spike) ───────────────────────────────────────────────
 * remark-math v6 parses a SINGLE-LINE `$$...$$` block (the common corpus form)
 * as an `inlineMath` node, NOT a block `math` node. So inline-vs-display is
 * decided by the SOURCE DELIMITER (`$$` → display, `$` → inline), read from the
 * original source via the node's `position`, NOT by the mdast node type.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMath from "remark-math";
import { toString as mdastToString } from "mdast-util-to-string";
import type { JSONContent } from "@tiptap/core";
import type {
  Root,
  RootContent,
  PhrasingContent,
  Paragraph as MdParagraph,
  Image as MdImage,
} from "mdast";
import type { InlineMath as MdInlineMath } from "mdast-util-math";

const processor = unified().use(remarkParse).use(remarkMath);

/** Convert a body_md string to a TipTap-compatible JSON document. */
export function markdownToDoc(md: string): JSONContent {
  const tree = processor.parse(md) as Root;
  const blocks: JSONContent[] = [];

  for (const child of tree.children) {
    appendBlock(child, md, blocks);
  }

  // ProseMirror requires at least one block; the top node content is `+`.
  if (blocks.length === 0) {
    blocks.push({ type: "paragraph" });
  }

  return { type: "doc", content: blocks };
}

/** Append the JSON block(s) produced by one mdast block node. */
function appendBlock(node: RootContent, src: string, out: JSONContent[]): void {
  switch (node.type) {
    case "paragraph":
      appendParagraph(node, src, out);
      return;
    case "math":
      // Block math from remark-math (multi-line `$$...$$`).
      out.push({ type: "mathDisplay", attrs: { latex: node.value } });
      return;
    case "image":
      out.push(imageNode(node));
      return;
    default: {
      // Defensive fallback: turn any unsupported block into a plain paragraph
      // carrying its text content, so nothing is lost and nothing throws.
      const text = mdastToString(node);
      out.push(
        text.length > 0
          ? { type: "paragraph", content: [{ type: "text", text }] }
          : { type: "paragraph" }
      );
      return;
    }
  }
}

/**
 * Walk a paragraph's phrasing children into inline JSON, applying the
 * image-promotion rule: a standalone-image paragraph becomes a top-level
 * `image` block; a paragraph that mixes text and images is split so the text
 * stays a paragraph and each image becomes a following `image` block.
 */
function appendParagraph(
  node: MdParagraph,
  src: string,
  out: JSONContent[]
): void {
  let inline: JSONContent[] = [];

  const flushParagraph = () => {
    // Only emit a paragraph if it carries meaningful (non-whitespace) content.
    const meaningful = inline.some(
      (n) => n.type !== "text" || (n.text ?? "").trim().length > 0
    );
    if (meaningful) {
      out.push({ type: "paragraph", content: inline });
    }
    inline = [];
  };

  for (const child of node.children) {
    if (child.type === "image") {
      // Image promotion: close any pending paragraph, then emit a block image.
      flushParagraph();
      out.push(imageNode(child));
      continue;
    }
    const mapped = mapPhrasing(child, src);
    if (!mapped) continue;
    if (mapped.type === "mathDisplay") {
      // Display math is a BLOCK node (remark-math parses single-line `$$...$$`
      // as inline, but the source delimiter says display — see CRITICAL note).
      // It cannot live inside a paragraph, so promote it out, exactly like an
      // image: close any pending paragraph, then emit the block.
      flushParagraph();
      out.push(mapped);
      continue;
    }
    inline.push(mapped);
  }

  flushParagraph();
}

/** Map a single phrasing (inline) mdast node to inline JSON, or null to drop. */
function mapPhrasing(
  node: PhrasingContent,
  src: string
): JSONContent | null {
  switch (node.type) {
    case "text":
      return { type: "text", text: node.value };

    case "inlineMath": {
      // Decide inline vs display by the ORIGINAL SOURCE DELIMITER, not the
      // mdast node type (see CRITICAL note above).
      if (isDisplayDelimited(node, src)) {
        return { type: "mathDisplay", attrs: { latex: node.value } };
      }
      return { type: "mathInline", attrs: { latex: node.value } };
    }

    default: {
      // Defensive fallback: flatten any unsupported phrasing to its text.
      const text = mdastToString(node);
      return text.length > 0 ? { type: "text", text } : null;
    }
  }
}

/**
 * Inspect the original source span of an `inlineMath` node to determine whether
 * the author used `$$` (display) or `$` (inline) delimiters.
 */
function isDisplayDelimited(node: MdInlineMath, src: string): boolean {
  const pos = node.position;
  if (!pos || pos.start.offset == null || pos.end.offset == null) {
    return false;
  }
  const raw = src.slice(pos.start.offset, pos.end.offset);
  return raw.startsWith("$$");
}

/** Build an `image` block node from an mdast image. */
function imageNode(node: MdImage): JSONContent {
  return {
    type: "image",
    attrs: { src: node.url ?? "", alt: node.alt ?? "" },
  };
}
