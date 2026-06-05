"use client";

/**
 * MathField — a controlled React wrapper around MathLive's <math-field>
 * Web Component (mathlive 0.109.2).
 *
 * MathLive registers `customElements.define("math-field")` at import time, which
 * requires a browser DOM. To keep that side-effect off the server we import the
 * module lazily inside a useEffect (the component itself only ever mounts inside
 * the editor, which is loaded via dynamic(..., { ssr:false })). The element is
 * created imperatively rather than as JSX so we don't depend on a global
 * `math-field` JSX intrinsic type.
 *
 * Controlled-value contract:
 *   - On mount the field is seeded with `latex` via setValue(..., { silenceNotifications:true }).
 *   - The "input" event drives onChange(getValue("latex")) on every keystroke.
 *   - An external `latex` prop that differs from the field's current value is
 *     pushed back in with setValue+silence, guarded so it never re-triggers
 *     onChange (feedback loop).
 *   - getValue("latex") (NOT "latex-expanded") is used so emitted LaTeX keeps
 *     macros and stays KaTeX-renderable.
 */

import { useEffect, useRef } from "react";
import type { MathfieldElement } from "mathlive";
import "./mathfield.css";

export interface MathFieldProps {
  latex: string;
  onChange: (latex: string) => void;
  /** Enter → commit and close editing. */
  onCommit?: () => void;
  /** Escape → revert and close editing. */
  onCancel?: () => void;
  /** Focus entered the field — register it as the active insert target. */
  onFocusField?: (field: MathfieldElement) => void;
  /**
   * Focus left the field. `relatedTarget` is where focus went; the caller
   * decides whether to commit (e.g. it should NOT commit when focus moved to a
   * formula-toolbar control that's about to insert into this same field).
   */
  onBlurField?: (relatedTarget: EventTarget | null) => void;
  /** Inline vs. display styling. */
  display?: boolean;
  autoFocus?: boolean;
}

export function MathField({
  latex,
  onChange,
  onCommit,
  onCancel,
  onFocusField,
  onBlurField,
  display = false,
  autoFocus = false,
}: MathFieldProps) {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const fieldRef = useRef<MathfieldElement | null>(null);

  // Keep the latest callbacks/values in refs so the mount effect can stay
  // dependency-free (it runs exactly once and wires the element).
  const onChangeRef = useRef(onChange);
  const onCommitRef = useRef(onCommit);
  const onCancelRef = useRef(onCancel);
  const onFocusFieldRef = useRef(onFocusField);
  const onBlurFieldRef = useRef(onBlurField);
  /** The value we last set on the field — used to break the prop↔input loop. */
  const lastValueRef = useRef(latex);

  // Refresh the callback refs after each render (not during, to satisfy the
  // react-hooks/refs rule). The mount effect reads them via .current.
  useEffect(() => {
    onChangeRef.current = onChange;
    onCommitRef.current = onCommit;
    onCancelRef.current = onCancel;
    onFocusFieldRef.current = onFocusField;
    onBlurFieldRef.current = onBlurField;
  });

  // ── Mount: lazily load MathLive, create the element, wire events. ──────────
  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    void import("mathlive").then(({ MathfieldElement }) => {
      if (cancelled || !hostRef.current) return;

      const field = new MathfieldElement();
      fieldRef.current = field;

      // Keep KaTeX-safe: don't let MathLive auto-expand into commands KaTeX
      // can't parse, and control the virtual keyboard explicitly.
      field.mathVirtualKeyboardPolicy = "manual";
      // Seed without firing "input".
      field.setValue(latex, { silenceNotifications: true });
      lastValueRef.current = latex;

      field.style.display = display ? "block" : "inline-block";
      if (!display) {
        field.style.verticalAlign = "middle";
      }

      // Live value sync.
      field.addEventListener("input", () => {
        const next = field.getValue("latex");
        lastValueRef.current = next;
        onChangeRef.current(next);
      });

      // Enter commits, Escape cancels. (math-field swallows most keys, but
      // these bubble; we also catch Enter before MathLive inserts a newline.)
      field.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onCommitRef.current?.();
        } else if (event.key === "Escape") {
          event.preventDefault();
          onCancelRef.current?.();
        }
      });

      // Focus entered → register this field as the active insert target.
      field.addEventListener("focusin", () => {
        onFocusFieldRef.current?.(field);
      });

      // Focus left → hand `relatedTarget` to the caller, which decides whether
      // to commit. It must NOT commit when focus moved to a formula-toolbar
      // control that is about to insert into this same field.
      field.addEventListener("focusout", (event: FocusEvent) => {
        onBlurFieldRef.current?.(event.relatedTarget);
      });

      hostRef.current.appendChild(field);

      // Disable MathLive's built-in context ("burger") menu. This MUST run
      // AFTER the field is connected to the DOM — the setter throws
      // "Mathfield not mounted" otherwise. The menu is flaky (it blurs the
      // field) and redundant now that the top toolbar inserts into the active
      // field, so all structures live in the top toolbar instead.
      field.menuItems = [];

      if (autoFocus) {
        // Focus on the next frame so the element is fully connected.
        requestAnimationFrame(() => {
          if (!cancelled) field.focus();
        });
      }
    });

    return () => {
      cancelled = true;
      const field = fieldRef.current;
      if (field) {
        field.remove();
        fieldRef.current = null;
      }
    };
    // Mount-once: subsequent prop changes are handled by the sync effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync: external latex prop → field (guarded against feedback loop). ─────
  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    if (latex === lastValueRef.current) return;
    lastValueRef.current = latex;
    field.setValue(latex, { silenceNotifications: true });
  }, [latex]);

  return <span ref={hostRef} data-math-field-host="" />;
}
