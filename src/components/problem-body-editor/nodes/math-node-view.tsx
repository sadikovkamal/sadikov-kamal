"use client";

/**
 * Shared React node-view for both math nodes. The `display` flag (derived from
 * the node type) only toggles layout — inline atom vs. own-line block.
 *
 * Three states:
 *   - rest:  KaTeX markup (dangerouslySetInnerHTML), clickable → enters edit.
 *   - edit (visual):  <MathField> (MathLive). Commit (Enter/blur) writes the
 *                     latex attr; Escape reverts to the value held on entry.
 *   - edit (raw):     a text input bound to the raw latex — the MANDATORY
 *                     escape hatch for formulas MathLive can't open visually,
 *                     toggled by a "</> LaTeX" affordance.
 *
 * The whole editing surface is contentEditable={false} so ProseMirror treats
 * the atom as opaque and never tries to manage MathLive's internals.
 *
 * A fresh empty node carries the transient attr `justInserted` (see the node
 * specs). When present we mount straight into visual-edit with autofocus and
 * clear the flag, so inserting a formula immediately drops the cursor inside it
 * (the MathType feel). `justInserted` has a default and is never serialized.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import type { MathfieldElement } from "mathlive";
import { MathField } from "./mathfield";
import { renderKatex } from "./katex-render";
import type { ActiveMathfieldStorage } from "../schema/extensions";

type EditMode = "none" | "visual" | "raw";

export function MathNodeView({
  node,
  updateAttributes,
  deleteNode,
  editor,
}: NodeViewProps) {
  const display = node.type.name === "mathDisplay";
  const latex: string = node.attrs.latex ?? "";
  const justInserted: boolean = Boolean(node.attrs.justInserted);

  // Draft holds the in-progress value while editing; committed on Enter/blur.
  const [draft, setDraft] = useState(latex);
  const [mode, setMode] = useState<EditMode>(justInserted ? "visual" : "none");
  // The value to restore if the user cancels (Escape).
  const revertRef = useRef(latex);

  // Clear the one-shot justInserted flag once we've consumed it to open editing.
  useEffect(() => {
    if (justInserted) {
      updateAttributes({ justInserted: false });
    }
    // Run once on mount for a freshly-inserted node.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const editable = editor?.isEditable ?? true;

  // ── Active-field registry (so the top toolbar can insert into THIS field) ──
  // The MathLive element this view currently owns while editing.
  const myFieldRef = useRef<MathfieldElement | null>(null);
  const getStorage = (): ActiveMathfieldStorage | undefined => {
    if (!editor) return undefined;
    return (
      editor.storage as unknown as Record<string, ActiveMathfieldStorage>
    ).activeMathfield;
  };
  const registerActiveField = (field: MathfieldElement) => {
    myFieldRef.current = field;
    const s = getStorage();
    if (s) s.field = field;
  };
  const clearActiveField = () => {
    const s = getStorage();
    if (s && s.field === myFieldRef.current) s.field = null;
    myFieldRef.current = null;
  };

  // Drop the registration if this view unmounts mid-edit (formula removed).
  useEffect(() => clearActiveField, []); // eslint-disable-line react-hooks/exhaustive-deps

  function enterEdit(next: EditMode) {
    if (!editable) return;
    revertRef.current = latex;
    setDraft(latex);
    setMode(next);
  }

  function commit() {
    clearActiveField();
    // Unfilled MathLive placeholders aren't KaTeX-renderable — strip them so a
    // partially-filled template (e.g. `\frac{5}{\placeholder{}}`) still renders
    // and a fully-empty one collapses to nothing (deleted below).
    const cleaned = draft.replace(/\\placeholder\{\}/g, "");
    // An empty formula must never persist — it would serialize to a bare `$$`
    // and corrupt the surrounding markdown on re-parse. Remove it instead.
    if (cleaned.trim() === "") {
      deleteNode();
      return;
    }
    if (cleaned !== latex) {
      updateAttributes({ latex: cleaned });
    }
    setMode("none");
  }

  function cancel() {
    clearActiveField();
    // A freshly-inserted formula that was never filled → remove it entirely.
    if (revertRef.current.trim() === "") {
      deleteNode();
      return;
    }
    setDraft(revertRef.current);
    setMode("none");
    // Return focus to the editor surface after cancelling.
    editor?.commands.focus();
  }

  const restMarkup = useMemo(() => {
    if (!latex.trim()) return null;
    return renderKatex(latex, display);
  }, [latex, display]);

  // ── Rest state ─────────────────────────────────────────────────────────
  if (mode === "none") {
    return (
      <NodeViewWrapper
        as={display ? "div" : "span"}
        className={
          display
            ? "pbe-math pbe-math-display my-3 block"
            : "pbe-math pbe-math-inline inline-block"
        }
        data-math-display={display ? "" : undefined}
        data-math-inline={display ? undefined : ""}
      >
        <span
          contentEditable={false}
          role="button"
          tabIndex={0}
          className="cursor-pointer rounded-sm outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => enterEdit("visual")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              enterEdit("visual");
            }
          }}
          aria-label={latex.trim() ? `Edit formula: ${latex}` : "Empty formula, click to edit"}
        >
          {restMarkup ? (
            <span dangerouslySetInnerHTML={{ __html: restMarkup }} />
          ) : (
            // Empty formula → faint, clickable placeholder.
            <span className="px-1 text-muted-foreground italic select-none">fx</span>
          )}
        </span>
      </NodeViewWrapper>
    );
  }

  // ── Edit states (visual / raw) ───────────────────────────────────────────
  return (
    <NodeViewWrapper
      as={display ? "div" : "span"}
      className={
        display
          ? "pbe-math pbe-math-display my-3 block"
          : "pbe-math pbe-math-inline inline-block"
      }
      data-math-display={display ? "" : undefined}
      data-math-inline={display ? undefined : ""}
    >
      <span
        contentEditable={false}
        className="inline-flex flex-col gap-1 rounded-md border border-ring bg-background p-1 align-middle shadow-sm ring-2 ring-ring/40"
      >
        {mode === "visual" ? (
          <MathField
            latex={draft}
            display={display}
            autoFocus
            onChange={setDraft}
            onCommit={commit}
            onCancel={cancel}
            onFocusField={registerActiveField}
            onBlurField={(relatedTarget) => {
              // Focus moved to a formula-toolbar control → keep this field open
              // (the toolbar is about to insert here and refocus it). Otherwise
              // the user clicked away, so commit.
              const el = relatedTarget as HTMLElement | null;
              if (el?.closest?.("[data-formula-tool]")) return;
              commit();
            }}
          />
        ) : (
          <input
            type="text"
            autoFocus
            value={draft}
            spellCheck={false}
            className="min-w-40 rounded-sm border border-input bg-transparent px-2 py-1 font-mono text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="raw LaTeX…"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
          />
        )}

        <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <button
            type="button"
            // Mouse-down (not click) so the field's focusout/commit doesn't
            // fire and close editing before the toggle runs.
            onMouseDown={(e) => {
              e.preventDefault();
              setMode(mode === "visual" ? "raw" : "visual");
            }}
            className="rounded-sm px-1 font-mono hover:text-foreground hover:underline"
            aria-pressed={mode === "raw"}
            title="Toggle raw LaTeX editing"
          >
            {"</> LaTeX"}
          </button>
          <span className="opacity-60">Enter to commit · Esc to cancel</span>
        </div>
      </span>
    </NodeViewWrapper>
  );
}
