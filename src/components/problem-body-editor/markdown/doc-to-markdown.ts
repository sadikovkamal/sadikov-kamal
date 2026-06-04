/**
 * STUB — Phase 1 will implement ProseMirror JSON → body_md serialisation.
 * Serialises the locked schema (paragraph | mathInline | mathDisplay | image)
 * back to Markdown with $…$ / $$…$$ / ![alt](url).
 */

/** Converts a ProseMirror-compatible JSON document back to a body_md string. */
export function docToMarkdown(_doc: Record<string, unknown>): string {
  throw new Error("docToMarkdown: not yet implemented (Phase 1)");
}
