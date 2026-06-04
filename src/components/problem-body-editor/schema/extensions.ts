/**
 * The locked editor schema for the WYSIWYG math editor.
 *
 * A deliberately MINIMAL TipTap v3 extension set — no StarterKit. The schema
 * cannot represent anything outside our grammar, which is what guarantees
 * round-trip fidelity:
 *
 *   doc       → (paragraph | mathDisplay | image)+
 *   paragraph → (text | mathInline)*
 *
 * Import paths confirmed for TipTap v3.25.0 (see NOTES.md):
 *   - Document/Paragraph/Text from their own packages
 *   - UndoRedo, Gapcursor, Dropcursor from the consolidated @tiptap/extensions
 */

import { Document } from "@tiptap/extension-document";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { UndoRedo, Gapcursor, Dropcursor } from "@tiptap/extensions";

import { MathInline } from "./math-inline";
import { MathDisplay } from "./math-display";
import { ImageNode } from "./image";

/**
 * Lock the top-level document content to our closed block set. Without this,
 * Document's default `block+` would permit any registered block; we want the
 * schema itself to reject anything outside the grammar.
 */
const LockedDocument = Document.extend({
  content: "(paragraph | mathDisplay | image)+",
});

export const editorExtensions = [
  LockedDocument,
  Paragraph,
  Text,
  MathInline,
  MathDisplay,
  ImageNode,
  UndoRedo,
  Gapcursor,
  Dropcursor,
];
