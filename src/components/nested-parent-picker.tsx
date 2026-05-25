"use client";

import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Layers,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Single-select parent picker for nested taxonomies (topics, methods).
 *
 * The original implementation used a flat `<Select>` that listed every
 * node depth-first with indentation — fine for a flat list of ~10
 * entries, painful once the tree grows to ~175 nested topics. This
 * picker mirrors the filter popover instead: a chevron-driven tree
 * that starts fully collapsed, with an optional search that
 * auto-expands ancestors of matches.
 *
 * Single-select semantics: clicking a row sets it as the parent and
 * closes the popover. A dedicated "Asosiy …" row at the top clears the
 * parent (root). Caller controls which ids appear via `options` — to
 * block self-parenting and descendants (cycle prevention), filter them
 * out before passing in.
 */
export interface NestedParentPickerOption {
  id: string;
  name: string;
  parentId: string | null;
}

interface TreeNode {
  option: NestedParentPickerOption;
  children: TreeNode[];
}

function buildTree(options: NestedParentPickerOption[]): TreeNode[] {
  const ids = new Set(options.map((o) => o.id));
  const byParent = new Map<string | null, NestedParentPickerOption[]>();
  for (const o of options) {
    // If parentId points at a node that was filtered out (e.g. the
    // current edit target), reparent to root so the orphan still
    // shows up in the picker.
    const key = o.parentId && ids.has(o.parentId) ? o.parentId : null;
    const arr = byParent.get(key) ?? [];
    arr.push(o);
    byParent.set(key, arr);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name));
  }
  function build(parentId: string | null): TreeNode[] {
    const kids = byParent.get(parentId) ?? [];
    return kids.map((option) => ({ option, children: build(option.id) }));
  }
  return build(null);
}

function collectParentIds(nodes: TreeNode[]): string[] {
  const out: string[] = [];
  function walk(ns: TreeNode[]) {
    for (const n of ns) {
      if (n.children.length > 0) {
        out.push(n.option.id);
        walk(n.children);
      }
    }
  }
  walk(nodes);
  return out;
}

export function NestedParentPicker({
  id,
  options,
  value,
  onChange,
  noneLabel,
  searchPlaceholder = "Qidirish…",
}: {
  /** Optional id for the trigger button — pairs with a parent <Label htmlFor>. */
  id?: string;
  options: NestedParentPickerOption[];
  /** Selected id, or null when the parent is "root". */
  value: string | null;
  onChange: (id: string | null) => void;
  /** Label for the "root / no parent" choice (e.g. "Asosiy mavzu"). */
  noneLabel: string;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const tree = useMemo(() => buildTree(options), [options]);
  const allParentIds = useMemo(() => collectParentIds(tree), [tree]);

  // Default to fully collapsed. The whole point of this picker over the
  // previous flat Select is that the admin starts with a scannable list
  // of roots and drills down only into the branch they care about.
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(allParentIds)
  );

  const searchLower = search.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!searchLower) {
      return {
        allow: null as Set<string> | null,
        expandedExtra: new Set<string>(),
      };
    }
    const allow = new Set<string>();
    const expandedExtra = new Set<string>();
    function walk(node: TreeNode, ancestors: string[]) {
      const matches = node.option.name.toLowerCase().includes(searchLower);
      if (matches) {
        allow.add(node.option.id);
        for (const a of ancestors) {
          allow.add(a);
          expandedExtra.add(a);
        }
      }
      for (const child of node.children) {
        walk(child, [...ancestors, node.option.id]);
      }
    }
    for (const root of tree) walk(root, []);
    return { allow, expandedExtra };
  }, [searchLower, tree]);

  function toggleCollapse(targetId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(targetId)) next.delete(targetId);
      else next.add(targetId);
      return next;
    });
  }

  function pick(targetId: string | null) {
    onChange(targetId);
    setOpen(false);
    setSearch("");
  }

  const selectedName = value
    ? (options.find((o) => o.id === value)?.name ?? null)
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            id={id}
            className="w-full justify-between font-normal"
          >
            {selectedName ? (
              <span className="truncate text-sm">{selectedName}</span>
            ) : (
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Layers className="size-3.5" aria-hidden />
                {noneLabel}
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
        {/* Search — flat string-match across all node names, with
            ancestor auto-expansion so a deep match doesn't hide behind
            a collapsed parent. */}
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search
            className="size-3.5 text-muted-foreground shrink-0"
            aria-hidden
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
        </div>

        <div className="max-h-[320px] overflow-auto py-1">
          {/* Root / "no parent" choice — always rendered first so the
              admin can clear a previously-set parent in one click. */}
          <button
            type="button"
            onClick={() => pick(null)}
            className={cn(
              "w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted text-left",
              value === null &&
                "bg-[var(--accent-brand)]/5 text-[var(--accent-brand-strong)] font-medium"
            )}
          >
            <span className="size-4 shrink-0" aria-hidden />
            <Layers
              className="size-3.5 text-muted-foreground shrink-0"
              aria-hidden
            />
            <span className="flex-1">{noneLabel}</span>
            {value === null && (
              <Check
                className="size-3.5 text-[var(--accent-brand)] shrink-0"
                aria-hidden
              />
            )}
          </button>

          {tree.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              {searchLower ? "Topilmadi" : "Bo'sh"}
            </p>
          ) : (
            <TreeRows
              nodes={tree}
              depth={0}
              collapsed={collapsed}
              expandedExtra={visible.expandedExtra}
              allow={visible.allow}
              selectedId={value}
              onToggleCollapse={toggleCollapse}
              onPick={pick}
            />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TreeRows({
  nodes,
  depth,
  collapsed,
  expandedExtra,
  allow,
  selectedId,
  onToggleCollapse,
  onPick,
}: {
  nodes: TreeNode[];
  depth: number;
  collapsed: Set<string>;
  /** Ancestor ids that should be force-expanded because a descendant matched a search. */
  expandedExtra: Set<string>;
  /** When non-null, only ids in this set may render. */
  allow: Set<string> | null;
  selectedId: string | null;
  onToggleCollapse: (id: string) => void;
  onPick: (id: string) => void;
}): React.ReactNode {
  return (
    <>
      {nodes.map((node) => {
        if (allow && !allow.has(node.option.id)) return null;
        const hasChildren = node.children.length > 0;
        const isCollapsed =
          collapsed.has(node.option.id) &&
          !expandedExtra.has(node.option.id);
        const isSelected = selectedId === node.option.id;
        const Chevron = isCollapsed ? ChevronRight : ChevronDown;

        return (
          <div key={node.option.id}>
            <div
              className={cn(
                "flex items-stretch gap-1.5 pr-2 text-sm transition-colors",
                isSelected
                  ? "bg-[var(--accent-brand)]/5"
                  : "hover:bg-muted/60"
              )}
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
            >
              {hasChildren ? (
                <button
                  type="button"
                  onClick={(e) => {
                    // Chevron is its own click target — clicking it must
                    // expand/collapse without also selecting the node.
                    e.stopPropagation();
                    onToggleCollapse(node.option.id);
                  }}
                  className="my-1 size-5 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/80 shrink-0"
                  aria-label={isCollapsed ? "Ochish" : "Yopish"}
                  aria-expanded={!isCollapsed}
                >
                  <Chevron className="size-3.5" aria-hidden />
                </button>
              ) : (
                <span className="my-1 size-5 shrink-0" aria-hidden />
              )}
              <button
                type="button"
                onClick={() => onPick(node.option.id)}
                className={cn(
                  "flex-1 min-w-0 flex items-center gap-2 py-1.5 text-left cursor-pointer",
                  isSelected &&
                    "font-medium text-[var(--accent-brand-strong)]"
                )}
                aria-pressed={isSelected}
              >
                <span className="truncate flex-1">{node.option.name}</span>
                {isSelected && (
                  <Check
                    className="size-3.5 text-[var(--accent-brand)] shrink-0"
                    aria-hidden
                  />
                )}
              </button>
            </div>

            {hasChildren && !isCollapsed && (
              <TreeRows
                nodes={node.children}
                depth={depth + 1}
                collapsed={collapsed}
                expandedExtra={expandedExtra}
                allow={allow}
                selectedId={selectedId}
                onToggleCollapse={onToggleCollapse}
                onPick={onPick}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
