"use client";

/**
 * STUB — Phase 2 will implement the MathLive <math-field> React wrapper.
 * Loaded with dynamic(..., { ssr: false }) because MathLive registers a
 * Web Component that requires a browser DOM.
 *
 * API notes (MathLive 0.109.2):
 *   - Read value:   mathfieldEl.getValue("latex")
 *   - Write value:  mathfieldEl.setValue(latex)
 *   - Change event: "input" fires on every keystroke; "change" fires on blur/Enter
 *   - Keyboard:     mathfieldEl.mathVirtualKeyboardPolicy = "manual" | "auto" | "sandboxed"
 */

export interface MathfieldProps {
  value: string;
  onChange: (latex: string) => void;
  onBlur?: () => void;
}

export function Mathfield(_props: MathfieldProps) {
  return null;
}
