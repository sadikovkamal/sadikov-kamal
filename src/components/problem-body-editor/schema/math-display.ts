/**
 * MathDisplay — block atom node holding a LaTeX string in its `latex` attribute.
 *
 * Phase 2: a React node-view (MathNodeView) renders KaTeX at rest and opens
 * MathLive on click. The DOM representation still carries the LaTeX in a
 * `data-latex` attribute so ProseMirror's clipboard/DOM serialisation survives.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { MathNodeView } from "../nodes/math-node-view";

export const MathDisplay = Node.create({
  name: "mathDisplay",
  group: "block",
  inline: false,
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
      // Transient UI-only flag — see math-inline.ts. Default + rendered:false
      // means it never reaches DOM/markdown serialization.
      justInserted: {
        default: false,
        rendered: false,
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-math-display]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-math-display": "" }, HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathNodeView);
  },
});
