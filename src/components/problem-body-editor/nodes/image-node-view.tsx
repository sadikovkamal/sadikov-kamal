"use client";

/**
 * ImageNodeView — renders an inline image (block atom) inside the editor.
 *
 * The canonical preview (markdown-preview.tsx via ReactMarkdown) renders R2
 * image URLs as a plain `<img>` styled `max-w-full rounded-md border`. We mirror
 * that here so the editor surface looks identical to the saved page. (We use a
 * plain `<img>` rather than next/image because the URLs are arbitrary external
 * R2 URLs and the preview pipeline does the same.)
 *
 * A small remove (×) control appears on hover; clicking it deletes this node.
 * The wrapper is contentEditable={false} so ProseMirror treats the atom as
 * opaque.
 */

import { useState } from "react";
import { X } from "lucide-react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

export function ImageNodeView({ node, deleteNode, editor }: NodeViewProps) {
  const src: string = node.attrs.src ?? "";
  const alt: string = node.attrs.alt ?? "";
  const editable = editor?.isEditable ?? true;
  const [hover, setHover] = useState(false);

  return (
    <NodeViewWrapper
      as="div"
      className="pbe-image my-3 block"
      data-pbe-image=""
    >
      <span
        contentEditable={false}
        className="relative inline-block max-w-full"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt}
            className="max-w-full rounded-md border"
            draggable={false}
          />
        ) : (
          <span className="inline-block rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
            Rasm yuklanmadi
          </span>
        )}

        {editable && hover && (
          <button
            type="button"
            aria-label="Rasmni o'chirish"
            title="Rasmni o'chirish"
            onClick={() => deleteNode()}
            className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-md bg-background/90 text-foreground shadow-sm ring-1 ring-foreground/10 transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="size-4" />
          </button>
        )}
      </span>
    </NodeViewWrapper>
  );
}
