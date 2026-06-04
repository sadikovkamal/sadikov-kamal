/**
 * STUB — Phase 1 will implement body_md → ProseMirror JSON conversion.
 * Uses remark-parse + remark-math to build an mdast, then maps nodes
 * to the locked TipTap schema (paragraph | mathInline | mathDisplay | image).
 */

import type { Schema } from "@tiptap/pm/model";

/** Converts a body_md string to a ProseMirror-compatible JSON document. */
export function markdownToDoc(
  _bodyMd: string,
  _schema: Schema
): Record<string, unknown> {
  throw new Error("markdownToDoc: not yet implemented (Phase 1)");
}
