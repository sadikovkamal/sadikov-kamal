"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { PrintConfig, PrintProblem } from "@/lib/print/types";
import { SelectedList } from "./selected-list";

/**
 * Left-rail configuration panel for the print dialog. Three collapsible
 * sections (native `<details>` — `components/ui` does not ship an
 * Accordion primitive, and rolling one for this single use-site would
 * add complexity for no real win):
 *
 *   1. Hujjat                — document-level knobs (title, font, line
 *                              height, margins, numbering style).
 *   2. Har masala ma'lumoti  — five toggles that drive the optional
 *                              per-problem metadata header in the docx.
 *   3. Tanlanganlar          — the ordered selection list, with
 *                              reorder/remove controls.
 *
 * Every control writes directly into the parent's `config` object via
 * `setConfig`. The panel is purely presentational — it owns no state of
 * its own.
 */

interface ConfigPanelProps {
  config: PrintConfig;
  setConfig: (updater: (prev: PrintConfig) => PrintConfig) => void;
  problems: PrintProblem[] | "loading" | { error: string };
  orderedIds: string[];
  setOrderedIds: (ids: string[]) => void;
  onRemove: (id: string) => void;
}

// Reusable section wrapper to keep the markup tidy. `<details>` is
// `open` by default so the user sees everything on first view.
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details open className="group/section">
      <summary className="flex cursor-pointer select-none items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
        <span>{title}</span>
        <span
          className="text-[10px] text-muted-foreground/70 transition-transform group-open/section:rotate-180"
          aria-hidden
        >
          ▾
        </span>
      </summary>
      <div className="pb-2">{children}</div>
    </details>
  );
}

// Compact label + control row used in the Hujjat section. The control
// fills the right column so selects line up visually regardless of
// their option-length-driven natural width.
function Row({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-center gap-2 px-3 py-1 text-xs">
      <label htmlFor={htmlFor} className="text-muted-foreground">
        {label}
      </label>
      <div>{children}</div>
    </div>
  );
}

// Tailwind-styled native select. Using a real `<select>` rather than a
// custom Listbox keeps keyboard / mobile semantics free and matches the
// "every control is small" aesthetic of the panel.
function NativeSelect({
  value,
  onChange,
  children,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-full rounded-lg border border-input bg-transparent px-2 py-1 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {children}
    </select>
  );
}

export function ConfigPanel({
  config,
  setConfig,
  problems,
  orderedIds,
  setOrderedIds,
  onRemove,
}: ConfigPanelProps) {
  return (
    <div className="flex h-full flex-col divide-y overflow-y-auto">
      {/* ----------------------------------------------------------------- */}
      {/* Section 1 — Hujjat                                                */}
      {/* ----------------------------------------------------------------- */}
      <Section title="Hujjat">
        <Row label="Sarlavha" htmlFor="print-title">
          <Input
            id="print-title"
            value={config.title}
            maxLength={200}
            placeholder="Bo'sh qoldirish mumkin"
            onChange={(e) =>
              setConfig((c) => ({ ...c, title: e.target.value }))
            }
          />
        </Row>
        <Row label="Shrift o'lchami" htmlFor="print-font">
          <NativeSelect
            id="print-font"
            value={String(config.fontSize)}
            onChange={(v) =>
              setConfig((c) => ({
                ...c,
                fontSize: Number(v) as PrintConfig["fontSize"],
              }))
            }
          >
            <option value="10">10</option>
            <option value="11">11</option>
            <option value="12">12</option>
            <option value="14">14</option>
          </NativeSelect>
        </Row>
        <Row label="Qator oralig'i" htmlFor="print-line-height">
          <NativeSelect
            id="print-line-height"
            value={String(config.lineHeight)}
            onChange={(v) =>
              setConfig((c) => ({
                ...c,
                lineHeight: Number(v) as PrintConfig["lineHeight"],
              }))
            }
          >
            <option value="1">1.0</option>
            <option value="1.15">1.15</option>
            <option value="1.5">1.5</option>
          </NativeSelect>
        </Row>
        <Row label="Sahifa chegarasi" htmlFor="print-margins">
          <NativeSelect
            id="print-margins"
            value={config.margins}
            onChange={(v) =>
              setConfig((c) => ({
                ...c,
                margins: v as PrintConfig["margins"],
              }))
            }
          >
            <option value="narrow">Tor</option>
            <option value="normal">Oddiy</option>
            <option value="wide">Keng</option>
          </NativeSelect>
        </Row>
        <Row label="Raqamlash uslubi" htmlFor="print-number-style">
          <NativeSelect
            id="print-number-style"
            value={config.numberStyle}
            onChange={(v) =>
              setConfig((c) => ({
                ...c,
                numberStyle: v as PrintConfig["numberStyle"],
              }))
            }
          >
            <option value="dot">1.</option>
            <option value="paren">1)</option>
            <option value="masala">Masala 1.</option>
          </NativeSelect>
        </Row>
      </Section>

      {/* ----------------------------------------------------------------- */}
      {/* Section 2 — Har masala ma'lumoti                                  */}
      {/* ----------------------------------------------------------------- */}
      <Section title="Har masala ma'lumoti">
        <FieldToggle
          label="Kod"
          checked={config.showFields.code}
          onChange={(v) =>
            setConfig((c) => ({
              ...c,
              showFields: { ...c.showFields, code: v },
            }))
          }
        />
        <FieldToggle
          label="Manba"
          checked={config.showFields.source}
          onChange={(v) =>
            setConfig((c) => ({
              ...c,
              showFields: { ...c.showFields, source: v },
            }))
          }
        />
        <FieldToggle
          label="Mavzular"
          checked={config.showFields.topics}
          onChange={(v) =>
            setConfig((c) => ({
              ...c,
              showFields: { ...c.showFields, topics: v },
            }))
          }
        />
        <FieldToggle
          label="Yosh toifalari"
          checked={config.showFields.ageCategories}
          onChange={(v) =>
            setConfig((c) => ({
              ...c,
              showFields: { ...c.showFields, ageCategories: v },
            }))
          }
        />
        <FieldToggle
          label="Metodlar"
          checked={config.showFields.methods}
          onChange={(v) =>
            setConfig((c) => ({
              ...c,
              showFields: { ...c.showFields, methods: v },
            }))
          }
        />
      </Section>

      {/* ----------------------------------------------------------------- */}
      {/* Section 3 — Tanlanganlar                                          */}
      {/* ----------------------------------------------------------------- */}
      <Section title={`Tanlanganlar (${orderedIds.length} ta)`}>
        <SelectedList
          orderedIds={orderedIds}
          problems={problems}
          onReorder={setOrderedIds}
          onRemove={onRemove}
          numberStyle={config.numberStyle}
        />
      </Section>
    </div>
  );
}

/**
 * Tap-target-friendly checkbox row. The whole `<label>` is clickable
 * so users don't have to hit the 16px box exactly.
 */
function FieldToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/40">
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
      />
      <span>{label}</span>
    </label>
  );
}
