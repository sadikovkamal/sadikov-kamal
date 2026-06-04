/**
 * MathDisplay — block atom node holding a LaTeX string in its `latex` attribute.
 *
 * Phase 1: schema only (no node-view yet — that lands in Phase 2). The DOM
 * representation carries the LaTeX in a `data-latex` attribute so ProseMirror's
 * own clipboard/DOM serialisation survives before a node-view exists.
 */

import { Node, mergeAttributes } from "@tiptap/core";

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
    };
  },

  parseHTML() {
    return [{ tag: "div[data-math-display]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-math-display": "" }, HTMLAttributes)];
  },
});
