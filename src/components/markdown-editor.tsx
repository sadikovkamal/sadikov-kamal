"use client";

import { useCallback } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { uploadImageAction } from "@/app/admin/_actions/upload-image";

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Logical folder for uploads, e.g. "problems/draft" or "problems/{id}". */
  uploadPrefix: string;
  minHeight?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  uploadPrefix,
  minHeight = "500px",
}: MarkdownEditorProps) {
  const handleDrop = useCallback(
    async (event: DragEvent, view: EditorView): Promise<boolean> => {
      const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
        f.type.startsWith("image/")
      );
      if (!files.length) return false;

      // We're handling this drop — prevent the browser from navigating
      // to the file when CodeMirror's default handler runs.
      event.preventDefault();

      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("prefix", uploadPrefix);
        const result = await uploadImageAction(formData);

        if ("success" in result && result.success && result.publicUrl) {
          const insert = `\n![${file.name}](${result.publicUrl})\n`;
          const pos = view.state.selection.main.head;
          view.dispatch({
            changes: { from: pos, insert },
            selection: { anchor: pos + insert.length },
          });
        } else if ("error" in result && result.error) {
          // Surface upload errors right at the cursor as a comment so the
          // admin sees what went wrong without dropping out of the editor.
          const errMsg = `\n<!-- upload failed: ${result.error} -->\n`;
          const pos = view.state.selection.main.head;
          view.dispatch({
            changes: { from: pos, insert: errMsg },
            selection: { anchor: pos + errMsg.length },
          });
        }
      }
      return true;
    },
    [uploadPrefix]
  );

  const dropExtension = EditorView.domEventHandlers({
    drop: (event, view) => {
      // CodeMirror types the listener as returning void | boolean; ours
      // returns a Promise so we kick it off without blocking the event.
      void handleDrop(event, view);
      // Returning true tells CodeMirror we handled it.
      return true;
    },
    dragover: (event) => {
      event.preventDefault();
      return false;
    },
  });

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={[
        markdown({ base: markdownLanguage }),
        EditorView.lineWrapping,
        dropExtension,
      ]}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
      }}
      height="auto"
      minHeight={minHeight}
      style={{ fontSize: "14px" }}
    />
  );
}
