/**
 * ImageNode — block atom node with `src` and `alt` attributes.
 *
 * We author our own minimal image node (rather than `@tiptap/extension-image`)
 * to keep the schema closed and the markdown mapping explicit. Phase 1 is
 * schema only; the rendering node-view lands in a later phase.
 */

import { Node, mergeAttributes } from "@tiptap/core";

export const ImageNode = Node.create({
  name: "image",
  group: "block",
  inline: false,
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: {
        default: "",
        parseHTML: (element) => element.getAttribute("src") ?? "",
        renderHTML: (attributes) => ({ src: (attributes as { src: string }).src }),
      },
      alt: {
        default: "",
        parseHTML: (element) => element.getAttribute("alt") ?? "",
        renderHTML: (attributes) => ({ alt: (attributes as { alt: string }).alt }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "img[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes)];
  },
});
