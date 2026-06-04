"use client";

/**
 * FormulaToolbar — the MathType-style "click a tool, fill the boxes" entry
 * point for the WYSIWYG math editor.
 *
 * Templates are grouped under compact popovers (see templates.ts). Clicking a
 * template inserts a FRESH math node seeded with the skeleton LaTeX and
 * `justInserted: true`, so the node-view (Phase 2) opens MathLive focused on the
 * first placeholder. Two explicit buttons insert an EMPTY inline / display node
 * for free-form entry.
 *
 * Insertion is disabled while the selection sits inside an existing math atom —
 * you can't nest a node inside an atom (plan Step 3.2.3). The check reads the
 * current selection's parent / node-at-cursor.
 *
 * Labels and tooltips are in Uzbek to match the app UI.
 */

import { Sigma, Superscript } from "lucide-react";
import type { Editor } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  FORMULA_GROUPS,
  type FormulaTarget,
  type FormulaTemplate,
} from "./templates";

export interface FormulaToolbarProps {
  /** The live TipTap editor instance, or null while it mounts. */
  editor: Editor | null;
}

/** Build the TipTap node JSON for a math insertion. */
function mathNode(target: FormulaTarget, latex: string) {
  return {
    type: target === "display" ? "mathDisplay" : "mathInline",
    attrs: { latex, justInserted: true },
  };
}

export function FormulaToolbar({ editor }: FormulaToolbarProps) {
  // Determine whether insertion is allowed: blocked when the caret is inside an
  // existing math atom (can't nest), or when there's no editor yet.
  const insideMath = isSelectionInMath(editor);
  const disabled = !editor || insideMath || !editor.isEditable;

  function insertTemplate(tpl: FormulaTemplate) {
    if (!editor || disabled) return;
    editor
      .chain()
      .focus()
      .insertContent(mathNode(tpl.target, tpl.latex))
      .run();
  }

  function insertEmpty(target: FormulaTarget) {
    if (!editor || disabled) return;
    editor.chain().focus().insertContent(mathNode(target, "")).run();
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {FORMULA_GROUPS.map((group) => (
        <Popover key={group.label}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                title={group.label}
                aria-label={group.label}
              >
                <span className="font-medium">{group.icon}</span>
              </Button>
            }
          />
          <PopoverContent align="start" className="w-auto max-w-80">
            <p className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
            <div className="grid grid-cols-6 gap-1">
              {group.templates.map((tpl) => (
                <button
                  key={tpl.latex + tpl.label}
                  type="button"
                  title={tpl.label}
                  aria-label={tpl.label}
                  disabled={disabled}
                  onClick={() => insertTemplate(tpl)}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-sm ring-1 ring-foreground/10 transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                >
                  {tpl.icon}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ))}

      {/* Free-form (empty) insertions. */}
      <span className="mx-1 h-5 w-px bg-foreground/10" aria-hidden />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        title="Satr ichida formula qo'shish"
        aria-label="Satr ichida formula qo'shish"
        onClick={() => insertEmpty("inline")}
      >
        <Superscript data-icon="inline-start" />
        Satr ichi
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        title="Alohida qatorga formula qo'shish"
        aria-label="Alohida qatorga formula qo'shish"
        onClick={() => insertEmpty("display")}
      >
        <Sigma data-icon="inline-start" />
        Alohida qator
      </Button>
    </div>
  );
}

/**
 * True when the current selection is a NodeSelection ON one of our math atoms.
 *
 * Math nodes are leaf atoms, so the caret can never be *inside* their content;
 * the only "can't insert here" case is when the whole atom is node-selected
 * (e.g. clicked/arrowed onto). Inserting then would replace the atom rather than
 * add a sibling, so we disable the toolbar (plan Step 3.2.3).
 */
function isSelectionInMath(editor: Editor | null): boolean {
  if (!editor) return false;
  const selectedNode = (
    editor.state.selection as { node?: { type: { name: string } } }
  ).node;
  return (
    !!selectedNode &&
    (selectedNode.type.name === "mathInline" ||
      selectedNode.type.name === "mathDisplay")
  );
}
