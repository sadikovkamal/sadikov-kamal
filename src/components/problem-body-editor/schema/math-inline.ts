/**
 * MathInline — inline atom node holding a LaTeX string in its `latex` attribute.
 *
 * Phase 2: a React node-view (MathNodeView) renders KaTeX at rest and opens
 * MathLive on click. The DOM representation still carries the LaTeX in a
 * `data-latex` attribute so ProseMirror's clipboard/DOM serialisation survives.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { MathNodeView } from "../nodes/math-node-view";

export const MathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-latex") ?? "",
        renderHTML: (attributes) => ({
          "data-latex": (attributes as { latex: string }).latex,
        }),
      },
      // Transient UI-only flag: when a fresh empty node is inserted, the
      // node-view consumes this once to open straight into edit mode, then
      // clears it. It has a default and is NEVER serialized (no renderHTML /
      // not read by the markdown I/O), so it can't affect round-trip fidelity.
      justInserted: {
        default: false,
        rendered: false,
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-math-inline]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes({ "data-math-inline": "" }, HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathNodeView);
  },
});
