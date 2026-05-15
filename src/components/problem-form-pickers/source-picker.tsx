"use client";

import { useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  ChevronsUpDown,
  Library,
  Search,
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Same data shape as the /admin/sources page passes around — id, code,
 * name, parentId, and the pre-resolved logo URL.
 */
export interface SourcePickerNode {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  logoPublicUrl: string | null;
}

interface FlatNode extends SourcePickerNode {
  depth: number;
  hasChildren: boolean;
}

/**
 * Single-select picker rendered as a collapsible nested tree. Mirrors
 * the topic picker UX so the form feels consistent across taxonomies:
 *
 *   1. Trigger shows the selected source (logo + name).
 *   2. Popover opens with all top-level sources visible.
 *   3. Chevron toggles a parent open/closed without selecting it.
 *   4. Clicking the row body selects that source (closes popover).
 *   5. Search collapses the tree to a flat list of matches.
 *
 * Default collapsed — admins drill into the branch they care about
 * instead of scrolling past everyone else's. Selecting an already-
 * selected node opens with that node's ancestors auto-expanded so the
 * current pick is visible.
 */
export function SourcePicker({
  available,
  value,
  onChange,
}: {
  available: SourcePickerNode[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const byId = useMemo(() => {
    const map = new Map<string, SourcePickerNode>();
    for (const s of available) map.set(s.id, s);
    return map;
  }, [available]);

  const ancestorChain = useMemo(() => {
    if (!value) return [] as string[];
    const out: string[] = [];
    let cur = byId.get(value);
    while (cur?.parentId) {
      const parent = byId.get(cur.parentId);
      if (!parent) break;
      out.push(parent.id);
      cur = parent;
    }
    return out;
  }, [value, byId]);

  // Pre-expand the selected node's ancestor chain so an admin who
  // re-opens the picker sees their current pick in context.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(ancestorChain)
  );

  const visible = useMemo<FlatNode[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return flattenTree(available, expanded);
    return available
      .filter((s) => s.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({ ...s, depth: 0, hasChildren: false }));
  }, [available, expanded, query]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    // Defer cleanup so the close animation doesn't flicker.
    setTimeout(() => {
      setQuery("");
    }, 150);
  }

  const selected = value ? (byId.get(value) ?? null) : null;
  const hasNesting = available.some((s) => s.parentId);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between h-auto py-2"
          >
            {selected ? (
              <span className="flex items-center gap-2 min-w-0 text-left">
                <PickerLogo
                  name={selected.name}
                  publicUrl={selected.logoPublicUrl}
                />
                <span className="block text-sm font-medium truncate text-foreground">
                  {selected.name}
                </span>
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">
                Manbani tanlang…
              </span>
            )}
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        }
      />
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        {/* Search */}
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search
            className="size-3.5 text-muted-foreground shrink-0"
            aria-hidden
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Manba qidirish…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
        </div>

        {/* Expand/collapse helpers — only show in tree mode */}
        {hasNesting && !query && (
          <div className="flex items-center justify-end gap-2 border-b px-2 py-1 text-[10px] text-muted-foreground">
            <button
              type="button"
              onClick={() =>
                setExpanded(
                  new Set(
                    available
                      .filter((s) => s.parentId !== null)
                      .map((s) => s.parentId!)
                  )
                )
              }
              className="hover:text-foreground underline underline-offset-2"
            >
              Hammasini ochish
            </button>
            <span className="text-muted-foreground/40">·</span>
            <button
              type="button"
              onClick={() => setExpanded(new Set())}
              className="hover:text-foreground underline underline-offset-2"
            >
              Yopish
            </button>
          </div>
        )}

        {/* Tree rows */}
        <div className="max-h-[320px] overflow-auto py-1">
          {visible.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Topilmadi
            </p>
          ) : (
            visible.map((node) => {
              const isSelected = value === node.id;
              const isExpanded = expanded.has(node.id);
              return (
                <div
                  key={node.id}
                  className={cn(
                    "group flex items-center gap-1 pr-2.5 text-sm transition-colors",
                    isSelected
                      ? "bg-[var(--accent-brand)]/5"
                      : "hover:bg-muted/60"
                  )}
                  style={{ paddingLeft: `${6 + node.depth * 14}px` }}
                >
                  {/* Expand chevron */}
                  {node.hasChildren ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(node.id);
                      }}
                      className="shrink-0 size-5 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/80"
                      aria-label={isExpanded ? "Yopish" : "Ochish"}
                      aria-expanded={isExpanded}
                    >
                      <ChevronRight
                        className={cn(
                          "size-3.5 transition-transform",
                          isExpanded && "rotate-90"
                        )}
                      />
                    </button>
                  ) : (
                    <span className="shrink-0 size-5" aria-hidden />
                  )}

                  {/* Row body — picks this source */}
                  <button
                    type="button"
                    onClick={() => pick(node.id)}
                    className="flex-1 min-w-0 flex items-center gap-2 py-1.5 text-left"
                  >
                    <PickerLogo
                      name={node.name}
                      publicUrl={node.logoPublicUrl}
                      size="sm"
                    />
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate",
                        isSelected &&
                          "font-medium text-[var(--accent-brand-strong)]"
                      )}
                    >
                      {node.name}
                    </span>
                    {node.hasChildren && (
                      <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
                        guruh
                      </span>
                    )}
                    {isSelected && (
                      <Check
                        className="size-3.5 text-[var(--accent-brand-strong)] shrink-0"
                        aria-hidden
                        strokeWidth={2.5}
                      />
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function flattenTree(
  items: SourcePickerNode[],
  expanded: ReadonlySet<string>
): FlatNode[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const childrenOf = new Map<string | null, SourcePickerNode[]>();
  for (const it of items) {
    const key =
      it.parentId && byId.has(it.parentId) ? it.parentId : null;
    const arr = childrenOf.get(key) ?? [];
    arr.push(it);
    childrenOf.set(key, arr);
  }
  for (const arr of childrenOf.values()) {
    arr.sort((a, b) => a.code.localeCompare(b.code));
  }
  const out: FlatNode[] = [];
  function walk(parentId: string | null, depth: number) {
    const kids = childrenOf.get(parentId) ?? [];
    for (const k of kids) {
      const hasChildren = (childrenOf.get(k.id)?.length ?? 0) > 0;
      out.push({ ...k, depth, hasChildren });
      if (hasChildren && expanded.has(k.id)) {
        walk(k.id, depth + 1);
      }
    }
  }
  walk(null, 0);
  return out;
}

/**
 * Logo with an icon fallback. Smaller variant used inside tree rows.
 */
function PickerLogo({
  name,
  publicUrl,
  size = "md",
}: {
  name: string;
  publicUrl: string | null;
  size?: "sm" | "md";
}) {
  const sizeClass = size === "sm" ? "size-6" : "size-8";
  const sizesAttr = size === "sm" ? "24px" : "32px";
  const iconSize = size === "sm" ? "size-3" : "size-4";
  if (publicUrl) {
    return (
      <div
        className={cn(
          "relative shrink-0 rounded-md overflow-hidden ring-1 ring-foreground/10 bg-white p-0.5",
          sizeClass
        )}
      >
        <Image
          src={publicUrl}
          alt={`${name} logo`}
          fill
          sizes={sizesAttr}
          className="object-contain"
        />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "shrink-0 rounded-md flex items-center justify-center",
        "bg-[var(--accent-brand)]/8 text-[var(--accent-brand-strong)]",
        "ring-1 ring-[var(--accent-brand)]/15",
        sizeClass
      )}
      aria-hidden
    >
      <Library className={iconSize} strokeWidth={1.75} />
    </div>
  );
}
