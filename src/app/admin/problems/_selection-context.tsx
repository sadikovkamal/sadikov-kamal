"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * Layout-scoped React-Context that tracks the IDs of problems the user
 * has ticked across filter changes, route navigation, and page reloads.
 *
 * The provider lives under `/admin/problems/*` (mounted from
 * `layout.tsx`), so it survives client-side navigation between the list,
 * detail, and edit pages without unmounting. Reload survival is handled
 * by `localStorage` under the well-known key below.
 *
 * Hook surface (consumed by `problems-list.tsx`, `bulk-edit-dialog.tsx`,
 * and the upcoming print dialog):
 *
 *   const { selected, isSelected, toggle, selectMany, deselectMany, clear }
 *     = useSelection();
 *
 * - `selected` is a `ReadonlySet<string>` so callers never accidentally
 *   mutate the internal state — every mutation must go through the
 *   provided setters.
 * - `selectMany` / `deselectMany` accept any `Iterable<string>` so callers
 *   can pass an `Array`, `Set`, or generator without converting first.
 *
 * SSR safety: the initial state is always an empty Set. Hydration from
 * localStorage happens in a one-shot `useEffect` after mount; if the
 * stored entry is missing or malformed the Set stays empty.
 */

const STORAGE_KEY = "provia:admin:problems:selection";

/**
 * UUIDs are 36 chars: 8-4-4-4-12 hex. We accept anything that loosely
 * matches that shape (case-insensitive, version-agnostic) — a strict
 * RFC 4122 check would reject e.g. nil UUIDs and add no real safety
 * since the only source of these IDs is our own DB.
 */
const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SelectionContextValue {
  selected: ReadonlySet<string>;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  selectMany: (ids: Iterable<string>) => void;
  deselectMany: (ids: Iterable<string>) => void;
  clear: () => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Initial render is SSR-safe: never touch localStorage during render.
  // Hydration happens in the mount-only effect below.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  // Hydrate once on mount. The initial render MUST be an empty Set to
  // match the SSR output — reading localStorage during render or via a
  // lazy `useState` initializer would diverge the server- and client-
  // rendered HTML and trip React's hydration mismatch check. So we
  // accept one extra render here in exchange for clean hydration.
  //
  // Missing or malformed entries → leave the Set empty (no throw).
  // Corrupt entries are overwritten on the next mutation by the
  // persistence effect below.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const valid = parsed.filter(
        (v): v is string => typeof v === "string" && UUID_SHAPE.test(v),
      );
      if (valid.length === 0) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-shot hydration from localStorage, see comment above
      setSelected(new Set(valid));
    } catch {
      // Bad JSON, blocked storage access, etc. Leave the Set empty —
      // the next mutation will overwrite the corrupt entry.
    }
  }, []);

  // Persist on every change. Wrap `setItem` so a quota-exceeded error
  // never bubbles to React — the in-memory state is still authoritative,
  // we just lose the across-reload guarantee for this session.
  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([...selected]),
      );
    } catch (e) {
      console.warn(
        "[SelectionProvider] failed to persist selection to localStorage",
        e,
      );
    }
  }, [selected]);

  const isSelected = useCallback(
    (id: string) => selected.has(id),
    [selected],
  );

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectMany = useCallback((ids: Iterable<string>) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }, []);

  const deselectMany = useCallback((ids: Iterable<string>) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setSelected((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  const value = useMemo<SelectionContextValue>(
    () => ({ selected, isSelected, toggle, selectMany, deselectMany, clear }),
    [selected, isSelected, toggle, selectMany, deselectMany, clear],
  );

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (ctx === null) {
    throw new Error(
      "useSelection() must be used inside <SelectionProvider>. " +
        "Ensure the consumer renders under /admin/problems/* where the " +
        "provider is mounted in layout.tsx.",
    );
  }
  return ctx;
}
