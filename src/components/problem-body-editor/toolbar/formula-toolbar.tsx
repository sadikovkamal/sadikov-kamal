"use client";

/**
 * FormulaToolbar — the always-at-the-top math tool palette.
 *
 * Two modes, decided per click by whether a MathLive field is currently being
 * edited (tracked in `editor.storage.activeMathfield`):
 *
 *   • A formula IS open  → the tool's LaTeX is inserted INTO that field
 *     (`field.insert(..., { selectionMode: "placeholder" })`), so structures
 *     like matrices/integrals/sums go straight into the formula you're editing.
 *     This replaces MathLive's flaky built-in "burger" menu (now disabled).
 *   • No formula open    → a fresh math node is created, seeded with the
 *     skeleton and `justInserted: true` (the node-view opens MathLive focused).
 *
 * Every interactive control carries `data-formula-tool` so the math node-view's
 * blur handler knows NOT to commit/close the field when focus moves to the
 * toolbar — the field stays open and is refocused after the insert.
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
import type { ActiveMathfieldStorage } from "../schema/extensions";

export interface FormulaToolbarProps {
  /** The live TipTap editor instance, or null while it mounts. */
  editor: Editor | null;
}

/** Build the TipTap node JSON for a NEW math insertion. */
function mathNode(target: FormulaTarget, latex: string) {
  return {
    type: target === "display" ? "mathDisplay" : "mathInline",
    attrs: { latex, justInserted: true },
  };
}

export function FormulaToolbar({ editor }: FormulaToolbarProps) {
  const disabled = !editor || !editor.isEditable;

  /**
   * Insert `latex`: into the formula currently being edited if one is open,
   * otherwise as a fresh math node of `target` type.
   */
  function insertLatex(latex: string, target: FormulaTarget) {
    if (!editor || disabled) return;
    const storage = (
      editor.storage as unknown as Record<
        string,
        ActiveMathfieldStorage | undefined
      >
    ).activeMathfield;
    const field = storage?.field ?? null;
    if (field) {
      // Into the open formula — placeholders become tab-stops, focus returns.
      field.insert(latex, { selectionMode: "placeholder", focus: true });
      return;
    }
    editor.chain().focus().insertContent(mathNode(target, latex)).run();
  }

  function insertTemplate(tpl: FormulaTemplate) {
    insertLatex(tpl.latex, tpl.target);
  }

  /** The two explicit buttons always start a brand-new formula. */
  function insertEmpty(target: FormulaTarget) {
    if (!editor || disabled) return;
    editor.chain().focus().insertContent(mathNode(target, "")).run();
  }

  return (
    <div
      data-formula-tool
      className="flex flex-wrap items-center gap-1"
    >
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
                data-formula-tool
              >
                <span className="font-medium">{group.icon}</span>
              </Button>
            }
          />
          <PopoverContent
            align="start"
            className="w-auto max-w-80"
            data-formula-tool
          >
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
                  data-formula-tool
                  // Don't steal focus from an open MathLive field on press.
                  onMouseDown={(e) => e.preventDefault()}
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

      {/* Free-form (empty) insertions — always start a new formula. */}
      <span className="mx-1 h-5 w-px bg-foreground/10" aria-hidden />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        title="Satr ichida formula qo'shish"
        aria-label="Satr ichida formula qo'shish"
        data-formula-tool
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
        data-formula-tool
        onClick={() => insertEmpty("display")}
      >
        <Sigma data-icon="inline-start" />
        Alohida qator
      </Button>
    </div>
  );
}
