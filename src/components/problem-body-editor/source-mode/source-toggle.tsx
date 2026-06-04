"use client";

/**
 * STUB — Phase 4 will implement the "Manba" raw-markdown toggle.
 * Switches the editor between WYSIWYG mode and a plain-text code area
 * showing/editing the raw body_md. Guarded two-way sync with error handling.
 */

export interface SourceToggleProps {
  value: string; // raw body_md
  onChange: (next: string) => void;
  children: React.ReactNode; // the WYSIWYG editor surface
}

export function SourceToggle(_props: SourceToggleProps) {
  return null;
}
