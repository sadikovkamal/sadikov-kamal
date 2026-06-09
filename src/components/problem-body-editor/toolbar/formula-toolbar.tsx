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

import { Fragment } from "react";
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
  FONT_STYLES,
  TEXT_COLORS,
  BACKGROUND_COLORS,
  type FormulaTarget,
  type FormulaTemplate,
  type FormulaSection,
} from "./templates";
import { MathIcon } from "./math-icon";
import type { ActiveMathfieldStorage } from "../schema/extensions";

/**
 * Teacher-friendly grouping. Each toolbar button is a "view group" that
 * COMPOSES one or more underlying FORMULA_GROUPS (from templates.ts) into a
 * single popover with labelled sub-sections — so 26 fragmented groups collapse
 * to a handful of intuitive ones. templates.ts keeps the formula data
 * untouched; the merge happens here, at display time.
 *
 *   • `triggerLatex` — the KaTeX glyph on the toolbar button.
 *   • `sources`      — FORMULA_GROUPS labels pulled into this button's popover,
 *                      in order. A multi-source view labels each source as a
 *                      section; a single flat source shows one unlabelled grid.
 *
 * View groups are laid out left-to-right in CLUSTERS, with a thin divider
 * between clusters.
 */
interface ViewGroup {
  label: string;
  triggerLatex: string;
  sources: string[];
}

const TOOLBAR_CLUSTERS: { name: string; groups: ViewGroup[] }[] = [
  {
    name: "Tuzilmalar",
    groups: [
      { label: "Kasr", triggerLatex: "\\frac{a}{b}", sources: ["Kasr"] },
      { label: "Daraja va indeks", triggerLatex: "x^{n}", sources: ["Indekslar"] },
      { label: "Ildiz", triggerLatex: "\\sqrt{x}", sources: ["Ildiz"] },
      { label: "Qavslar", triggerLatex: "\\left(\\square\\right)", sources: ["Qavslar"] },
      {
        label: "Matritsa va vektor",
        triggerLatex: "\\left[\\begin{smallmatrix}1&0\\\\0&1\\end{smallmatrix}\\right]",
        sources: ["Matritsalar"],
      },
    ],
  },
  {
    name: "Analiz",
    groups: [
      {
        label: "Yig'indi va ko'paytma",
        triggerLatex: "\\sum",
        sources: ["Yig'indilar", "Ko'paytmalar", "To'plam amallari", "Boshqa katta operatorlar"],
      },
      {
        label: "Integrallar",
        triggerLatex: "\\int",
        sources: ["Integrallar", "Kontur integrallar", "Differensiallar"],
      },
      { label: "Hosila va limit", triggerLatex: "\\tfrac{d}{dx}", sources: ["Boshqalar"] },
      {
        label: "Funksiyalar",
        triggerLatex: "\\sin",
        sources: [
          "Trigonometrik funksiyalar",
          "Giperbolik funksiyalar",
          "Qo'shimcha funksiyalar",
          "Funksiyalar",
        ],
      },
    ],
  },
  {
    name: "Belgilar",
    groups: [
      { label: "Aksent va belgi", triggerLatex: "\\hat{x}", sources: ["Aksent va bezaklar"] },
      { label: "Munosabatlar", triggerLatex: "\\leq", sources: ["Munosabatlar"] },
      { label: "Amallar", triggerLatex: "\\pm", sources: ["Amallar"] },
      { label: "To'plam va mantiq", triggerLatex: "\\in", sources: ["To'plam va mantiq"] },
      { label: "O'qlar", triggerLatex: "\\rightarrow", sources: ["O'qlar"] },
      { label: "Operatorlar", triggerLatex: "\\triangleq", sources: ["Operatorlar"] },
      { label: "Maxsus belgilar", triggerLatex: "\\infty", sources: ["Maxsus belgilar"] },
    ],
  },
  {
    name: "Yunon",
    groups: [
      {
        label: "Yunon harflari",
        triggerLatex: "\\alpha",
        sources: ["Yunon (kichik)", "Yunon (katta)"],
      },
    ],
  },
];

/** Source-group lookup by label, built once. */
const GROUP_BY_LABEL = new Map(FORMULA_GROUPS.map((g) => [g.label, g]));

/**
 * Flatten a view group's source FORMULA_GROUPS into popover sections. A source
 * that already has `sections` contributes them verbatim; a flat source becomes
 * one section — unlabelled when it's the view's only source, otherwise headed
 * by the source group's own label.
 */
function composeSections(view: ViewGroup): FormulaSection[] {
  const multi = view.sources.length > 1;
  const out: FormulaSection[] = [];
  for (const srcLabel of view.sources) {
    const g = GROUP_BY_LABEL.get(srcLabel);
    if (!g) continue;
    if (g.sections) {
      out.push(...g.sections);
    } else {
      out.push({ label: multi ? g.label : "", templates: g.templates ?? [] });
    }
  }
  return out;
}

/** Thin vertical separator between clusters / toolbar zones. */
function ToolbarDivider() {
  return (
    <span
      aria-hidden
      className="mx-0.5 h-7 w-px shrink-0 self-center bg-foreground/10"
    />
  );
}

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
  /** The MathLive field currently being edited, if any. */
  function getActiveField() {
    if (!editor) return null;
    const storage = (
      editor.storage as unknown as Record<
        string,
        ActiveMathfieldStorage | undefined
      >
    ).activeMathfield;
    return storage?.field ?? null;
  }

  function insertLatex(latex: string, target: FormulaTarget) {
    if (!editor || disabled) return;
    const field = getActiveField();
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

  /**
   * Apply a font style / colour to the CURRENT selection of the open formula
   * (Word-style). `#@` is replaced by the selection. No-op when no formula is
   * being edited — these style math, not prose.
   */
  function wrapStyle(latex: string) {
    if (!editor || disabled) return;
    const field = getActiveField();
    if (!field) return;
    field.insert(latex, { selectionMode: "item", focus: true });
  }

  /** The two explicit buttons always start a brand-new formula. */
  function insertEmpty(target: FormulaTarget) {
    if (!editor || disabled) return;
    editor.chain().focus().insertContent(mathNode(target, "")).run();
  }

  return (
    <div
      data-formula-tool
      className="flex flex-wrap items-center gap-x-1 gap-y-1.5"
    >
      {TOOLBAR_CLUSTERS.map((cluster, ci) => (
        <Fragment key={cluster.name}>
          {ci > 0 && <ToolbarDivider />}
          {cluster.groups.map((view) => (
            <Popover key={view.label}>
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    title={view.label}
                    aria-label={view.label}
                    data-formula-tool
                    className="h-9 min-w-9 px-2"
                  >
                    <MathIcon
                      latex={view.triggerLatex}
                      className="inline-flex items-center justify-center leading-none [&_.katex]:text-[1.05em]"
                    />
                  </Button>
                }
              />
              <PopoverContent
                align="start"
                className="max-h-[70vh] w-auto max-w-80 overflow-y-auto"
                data-formula-tool
              >
                <p className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {view.label}
                </p>
                {/* Sections composed from the view's source groups. */}
                {composeSections(view).map(
                  (section, i) => (
                    <div key={section.label || i}>
                      {section.label ? (
                        <p className="px-1 pb-1 pt-2 text-[10px] font-medium text-muted-foreground/80">
                          {section.label}
                        </p>
                      ) : null}
                      <div className="grid grid-cols-6 gap-1">
                        {section.templates.map((tpl) => (
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
                            className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md ring-1 ring-foreground/10 transition-colors hover:bg-muted hover:ring-foreground/25 disabled:pointer-events-none disabled:opacity-50"
                          >
                            <MathIcon
                              latex={tpl.latex}
                              fallback={tpl.icon}
                              fit
                              className="leading-none"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </PopoverContent>
            </Popover>
          ))}
        </Fragment>
      ))}

      <ToolbarDivider />

      {/* Stil: shrift + rang. Applies to the OPEN formula's selection (Word
          style). No-op when no formula is being edited. */}
      <Popover>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              title="Shrift va rang"
              aria-label="Shrift va rang"
              data-formula-tool
            >
              <span className="font-bold italic">A</span>
            </Button>
          }
        />
        <PopoverContent align="start" className="w-auto" data-formula-tool>
          <p className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Shrift
          </p>
          <div className="flex gap-1">
            {FONT_STYLES.map((s) => (
              <button
                key={s.label}
                type="button"
                title={s.label}
                aria-label={s.label}
                disabled={disabled}
                data-formula-tool
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => wrapStyle(s.latex)}
                className="flex h-9 w-9 items-center justify-center rounded-md ring-1 ring-foreground/10 transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
              >
                <span
                  className={
                    s.icon === "B"
                      ? "font-bold"
                      : s.icon === "I"
                        ? "italic"
                        : ""
                  }
                >
                  {s.icon}
                </span>
              </button>
            ))}
          </div>

          <p className="px-1 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Rang
          </p>
          <div className="flex gap-1">
            {TEXT_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                title={c.name}
                aria-label={`Matn rangi: ${c.name}`}
                disabled={disabled}
                data-formula-tool
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => wrapStyle(`\\textcolor{${c.value}}{#@}`)}
                className="h-7 w-7 rounded-md ring-1 ring-foreground/15 transition-transform hover:scale-110 disabled:pointer-events-none disabled:opacity-50"
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>

          <p className="px-1 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Fon
          </p>
          <div className="flex gap-1">
            {BACKGROUND_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                title={c.name}
                aria-label={`Fon rangi: ${c.name}`}
                disabled={disabled}
                data-formula-tool
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => wrapStyle(`\\colorbox{${c.value}}{#@}`)}
                className="h-7 w-7 rounded-md ring-1 ring-foreground/15 transition-transform hover:scale-110 disabled:pointer-events-none disabled:opacity-50"
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Free-form (empty) insertions — always start a new formula. */}
      <ToolbarDivider />
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
