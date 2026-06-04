"use client";

/**
 * SourceToggle — the header segmented control that flips the editor between
 * the WYSIWYG surface ("Ko'rinish" / visual) and the raw-markdown view
 * ("Manba" / source).
 *
 * Two toggle buttons sharing one logical value. Each button is a real
 * `aria-pressed` toggle, keyboard reachable (native <button>), so the control
 * is fully accessible. The owning component (`index.tsx`) keeps the mode state
 * and decides — via the guarded sync — whether a requested switch is allowed.
 */

import { Code2, Eye } from "lucide-react";

export type EditorMode = "visual" | "source";

export interface SourceToggleProps {
  mode: EditorMode;
  onChange: (mode: EditorMode) => void;
}

export function SourceToggle({ mode, onChange }: SourceToggleProps) {
  return (
    <div
      role="group"
      aria-label="Tahrir rejimi"
      className="inline-flex items-center rounded-md border bg-background p-0.5 text-xs"
    >
      <button
        type="button"
        aria-pressed={mode === "visual"}
        onClick={() => onChange("visual")}
        title="Ko'rinish (vizual)"
        className={
          "inline-flex items-center gap-1 rounded-sm px-2 py-1 font-medium transition-colors " +
          (mode === "visual"
            ? "bg-muted text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground")
        }
      >
        <Eye className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">Ko&apos;rinish</span>
      </button>
      <button
        type="button"
        aria-pressed={mode === "source"}
        onClick={() => onChange("source")}
        title="Manba (xom matn)"
        className={
          "inline-flex items-center gap-1 rounded-sm px-2 py-1 font-medium transition-colors " +
          (mode === "source"
            ? "bg-muted text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground")
        }
      >
        <Code2 className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">Manba</span>
      </button>
    </div>
  );
}
