"use client";

/**
 * ProblemBodyEditor — the WYSIWYG math editing surface.
 *
 * A controlled component: `value` (body_md) in, `onChange` (body_md) out. It
 * mounts a TipTap v3 editor on the LOCKED schema (schema/extensions.ts), so the
 * document can only ever contain the six allowed node types — pasting rich HTML
 * (bold/lists/tables) is dropped to plain paragraphs/text by the schema itself.
 *
 * The single bordered surface IS the rendered view (no separate preview pane).
 * The header row hosts the formula toolbar, the image-upload control, and a
 * right-aligned reserved slot for the Phase 4 source ("Manba") toggle.
 *
 * ── Controlled-value reconciliation ────────────────────────────────────────
 * `onUpdate` serializes the doc back to markdown and calls `onChange`. When the
 * `value` prop changes from OUTSIDE (edit-form load, or the Phase 4 toggle
 * writing new md) AND differs from the editor's current serialization, we push
 * it in with `setContent(..., false)`. The diff guard is essential — without it
 * every keystroke (which round-trips through `onChange` → parent → `value`)
 * would reset the document and jump the cursor.
 *
 * ── SSR ────────────────────────────────────────────────────────────────────
 * This module registers no browser-only globals at import time, but it is meant
 * to be loaded via `dynamic(..., { ssr: false })` (it embeds MathLive). We pass
 * `immediatelyRender: false` so `useEditor` defers creation to the client and
 * never produces a hydration mismatch; the hook then returns `Editor | null`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { ImagePlus, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadImageAction } from "@/app/admin/_actions/upload-image";
import { editorExtensions } from "./schema/extensions";
import { markdownToDoc } from "./markdown/markdown-to-doc";
import { docToMarkdown } from "./markdown/doc-to-markdown";
import { FormulaToolbar } from "./toolbar/formula-toolbar";

export interface ProblemBodyEditorProps {
  value: string; // body_md
  onChange: (next: string) => void;
  uploadPrefix: string; // "problems/draft" | "problems/{id}"
  minHeight?: string;
  /**
   * Reserved slot for the Phase 4 source ("Manba") toggle. Rendered
   * right-aligned in the header. Left empty until Phase 4 wires it.
   */
  sourceToggleSlot?: React.ReactNode;
}

export function ProblemBodyEditor({
  value,
  onChange,
  uploadPrefix,
  minHeight = "240px",
  sourceToggleSlot,
}: ProblemBodyEditorProps) {
  // Keep the latest serialized markdown the editor produced, so the external
  // reconciliation effect can tell a genuine outside change from an echo of our
  // own onChange.
  const lastEmittedRef = useRef<string>(value);
  // Stable ref to onChange so the editor's onUpdate closure never goes stale.
  const onChangeRef = useRef(onChange);
  // Stable ref to uploadPrefix for the drop handler (captured once in useEditor).
  const uploadPrefixRef = useRef(uploadPrefix);
  // Stable ref to the editor itself, so config-time closures (handleDrop) can
  // reach the live instance once it's created.
  const editorRef = useRef<Editor | null>(null);
  useEffect(() => {
    onChangeRef.current = onChange;
    uploadPrefixRef.current = uploadPrefix;
  });

  const editor = useEditor({
    extensions: editorExtensions,
    content: markdownToDoc(value),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        // Min-height + padding live here so the contenteditable area itself is
        // the click target / scroll container.
        class:
          "pbe-content prose prose-slate max-w-none dark:prose-invert focus:outline-none px-4 py-3",
        style: `min-height:${minHeight}`,
      },
      // Drag-and-drop image upload: upload the dropped image(s) and insert an
      // `image` node at the drop position. Returning true tells ProseMirror we
      // handled the drop (don't fall back to default file handling).
      handleDrop(view, event) {
        const dt = (event as DragEvent).dataTransfer;
        const files = Array.from(dt?.files ?? []).filter((f) =>
          f.type.startsWith("image/")
        );
        const file = files[0];
        if (!file) return false;
        event.preventDefault();
        const coords = view.posAtCoords({
          left: (event as DragEvent).clientX,
          top: (event as DragEvent).clientY,
        });
        const pos = coords?.pos;
        const ed = editorRef.current;
        if (!ed) return true;
        // Upload only the first image (at-most-one convention).
        void uploadAndInsert(ed, file, uploadPrefixRef.current, pos);
        return true;
      },
    },
    onUpdate({ editor }) {
      const md = docToMarkdown(editor.getJSON());
      lastEmittedRef.current = md;
      onChangeRef.current(md);
    },
  });

  // Keep the editor ref current for config-time closures (handleDrop).
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // External-update reconciliation (the classic controlled-editor pitfall).
  useEffect(() => {
    if (!editor) return;
    // Echo of our own keystroke → ignore (would reset the cursor).
    if (value === lastEmittedRef.current) return;
    // A real outside change only if it also differs from what's on screen.
    const current = docToMarkdown(editor.getJSON());
    if (value === current) return;
    lastEmittedRef.current = value;
    // TipTap v3: setContent takes (content, options). `emitUpdate:false` avoids
    // emitting another update from this programmatic change (would loop).
    editor.commands.setContent(markdownToDoc(value), { emitUpdate: false });
  }, [editor, value]);

  return (
    <div className="rounded-xl ring-1 ring-foreground/10 overflow-hidden bg-card shadow-sm">
      <header className="flex items-center gap-2 px-2 h-11 border-b bg-muted/30">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground pr-1">
          <Pencil className="size-3" aria-hidden />
          <span className="hidden sm:inline">Tahrir</span>
        </div>

        <FormulaToolbar editor={editor} />

        <span className="mx-1 h-5 w-px bg-foreground/10" aria-hidden />

        <ImageUploadButton editor={editor} uploadPrefix={uploadPrefix} />

        {/* Right-aligned reserved slot for the Phase 4 source toggle. */}
        <div className="ml-auto flex items-center">{sourceToggleSlot}</div>
      </header>

      <div className="overflow-auto">
        {editor ? (
          <EditorContent editor={editor} />
        ) : (
          <div
            className="px-4 py-3 text-sm text-muted-foreground"
            style={{ minHeight }}
          >
            {"Muharrir yuklanmoqda…"}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Upload an image file via the shared server action and insert an `image` node
 * at the given position (or the current selection if `pos` is omitted).
 *
 * At-most-one-image convention: the single-problem form treats the body image as
 * a single slot. We mirror that here — if an `image` node already exists in the
 * doc we REPLACE it rather than appending a second one.
 */
async function uploadAndInsert(
  editor: Editor,
  file: File,
  uploadPrefix: string,
  pos?: number
): Promise<string | null> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("prefix", uploadPrefix);
  const res = await uploadImageAction(fd);
  if (!("success" in res) || !res.success) {
    return ("error" in res && res.error) || "Yuklab bo'lmadi";
  }

  const imageNode = {
    type: "image",
    attrs: { src: res.publicUrl, alt: file.name },
  };

  // Find an existing image to replace (at-most-one convention).
  let existingPos: number | null = null;
  editor.state.doc.descendants((node, nodePos) => {
    if (existingPos === null && node.type.name === "image") {
      existingPos = nodePos;
      return false;
    }
    return undefined;
  });

  if (existingPos !== null) {
    const at = existingPos;
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.replaceWith(
          at,
          at + 1,
          editor.schema.nodeFromJSON(imageNode)
        );
        return true;
      })
      .run();
    return null;
  }

  const chain = editor.chain().focus();
  if (typeof pos === "number") chain.setTextSelection(pos);
  chain.insertContent(imageNode).run();
  return null;
}

function ImageUploadButton({
  editor,
  uploadPrefix,
}: {
  editor: Editor | null;
  uploadPrefix: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = useCallback(
    async (file: File) => {
      if (!editor) return;
      setUploading(true);
      setError(null);
      try {
        const err = await uploadAndInsert(editor, file, uploadPrefix);
        if (err) setError(err);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Yuklab bo'lmadi");
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [editor, uploadPrefix]
  );

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={!editor || uploading}
        title="Rasm yuklash"
        aria-label="Rasm yuklash"
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 data-icon="inline-start" className="animate-spin" />
        ) : (
          <ImagePlus data-icon="inline-start" />
        )}
        <span className="hidden md:inline">
          {uploading ? "Yuklanmoqda…" : "Rasm yuklash"}
        </span>
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
