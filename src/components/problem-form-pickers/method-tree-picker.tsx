"use client";

import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  buildMethodTree,
  type MethodTreeNode,
} from "@/lib/taxonomy/method-codes";
import { parentIdSet } from "@/lib/taxonomy/hierarchy";
import type { Method } from "@/db/schema";

/**
 * Multi-select picker for methods. Mirror of TopicTreePicker — nested
 * tree, chevron expand/collapse, search, parent rows disabled (leaf-only
 * rule), selected badges below the trigger.
 */
export function MethodTreePicker({
  available,
  value,
  onChange,
}: {
  available: Method[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const tree = useMemo(() => buildMethodTree(available), [available]);

  const parentSet = useMemo(
    () =>
      parentIdSet(
        available.map((m) => ({ id: m.id, parentId: m.parentId }))
      ),
    [available]
  );

  const allParentIds = useMemo(() => collectParentIds(tree), [tree]);
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
    function walk(node: MethodTreeNode<Method>, ancestors: string[]) {
      const matches = node.method.name.toLowerCase().includes(searchLower);
      if (matches) {
        allow.add(node.method.id);
        for (const a of ancestors) {
          allow.add(a);
          expandedExtra.add(a);
        }
      }
      for (const child of node.children) {
        walk(child, [...ancestors, node.method.id]);
      }
    }
    for (const root of tree) walk(root, []);
    return { allow, expandedExtra };
  }, [searchLower, tree]);

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelect(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
      return;
    }
    if (parentSet.has(id)) return;
    onChange([...value, id]);
  }

  const selected = available.filter(
    (m) => value.includes(m.id) && !parentSet.has(m.id)
  );

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between"
            >
              <span className="text-sm text-muted-foreground">
                {selected.length === 0
                  ? "Metodlarni tanlang…"
                  : `${selected.length} ta tanlangan`}
              </span>
              <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
            </Button>
          }
        />
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
        >
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search
              className="size-3.5 text-muted-foreground shrink-0"
              aria-hidden
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Metod qidirish…"
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
          </div>

          <div className="max-h-[320px] overflow-auto py-1">
            {tree.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                Metodlar topilmadi
              </p>
            ) : (
              <TreeRows
                nodes={tree}
                depth={0}
                collapsed={collapsed}
                expandedExtra={visible.expandedExtra}
                allow={visible.allow}
                selectedIds={value}
                parentSet={parentSet}
                onToggleCollapse={toggleCollapse}
                onToggleSelect={toggleSelect}
              />
            )}
          </div>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((m) => (
            <Badge key={m.id} variant="secondary" className="gap-1">
              {m.name}
              <button
                type="button"
                aria-label={`${m.name} ni olib tashlash`}
                onClick={() => toggleSelect(m.id)}
                className="hover:opacity-70"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function TreeRows({
  nodes,
  depth,
  collapsed,
  expandedExtra,
  allow,
  selectedIds,
  parentSet,
  onToggleCollapse,
  onToggleSelect,
}: {
  nodes: MethodTreeNode<Method>[];
  depth: number;
  collapsed: Set<string>;
  expandedExtra: Set<string>;
  allow: Set<string> | null;
  selectedIds: string[];
  parentSet: Set<string>;
  onToggleCollapse: (id: string) => void;
  onToggleSelect: (id: string) => void;
}): React.ReactNode {
  return (
    <>
      {nodes.map((node) => {
        if (allow && !allow.has(node.method.id)) return null;
        const hasChildren = node.children.length > 0;
        const isCollapsed =
          collapsed.has(node.method.id) &&
          !expandedExtra.has(node.method.id);
        const isSelected = selectedIds.includes(node.method.id);
        const Chevron = isCollapsed ? ChevronRight : ChevronDown;

        return (
          <div key={node.method.id}>
            <div
              role={parentSet.has(node.method.id) ? undefined : "button"}
              tabIndex={parentSet.has(node.method.id) ? undefined : 0}
              className={cn(
                "group flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-sm transition-colors",
                parentSet.has(node.method.id)
                  ? "cursor-default text-muted-foreground"
                  : "cursor-pointer hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand)]",
                isSelected && "bg-[var(--accent-brand)]/5"
              )}
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
              aria-disabled={parentSet.has(node.method.id) || undefined}
              aria-label={
                parentSet.has(node.method.id)
                  ? undefined
                  : isSelected
                    ? `${node.method.name} metodini tanlovdan olib tashlash`
                    : `${node.method.name} metodini tanlash`
              }
              title={
                parentSet.has(node.method.id)
                  ? "Faqat ichki metod tanlanadi — bu guruh"
                  : undefined
              }
              onClick={() => {
                if (parentSet.has(node.method.id)) return;
                onToggleSelect(node.method.id);
              }}
              onKeyDown={(e) => {
                if (parentSet.has(node.method.id)) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggleSelect(node.method.id);
                }
              }}
            >
              {hasChildren ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleCollapse(node.method.id);
                  }}
                  className="size-4 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground shrink-0"
                  aria-label={
                    isCollapsed
                      ? `${node.method.name}ni ochish`
                      : `${node.method.name}ni yopish`
                  }
                >
                  <Chevron className="size-3.5" aria-hidden />
                </button>
              ) : (
                <span className="size-4 shrink-0" aria-hidden />
              )}

              <span
                className={cn(
                  "shrink-0 size-4 rounded border flex items-center justify-center transition-colors",
                  isSelected
                    ? "border-[var(--accent-brand)] bg-[var(--accent-brand)] text-white"
                    : "border-foreground/20 bg-card"
                )}
                aria-hidden
              >
                {isSelected && <Check className="size-3" strokeWidth={3} />}
              </span>

              <span
                className={cn(
                  "truncate flex-1",
                  isSelected && "font-medium text-[var(--accent-brand-strong)]"
                )}
              >
                {node.method.name}
              </span>
            </div>

            {hasChildren && !isCollapsed && (
              <TreeRows
                nodes={node.children}
                depth={depth + 1}
                collapsed={collapsed}
                expandedExtra={expandedExtra}
                allow={allow}
                selectedIds={selectedIds}
                parentSet={parentSet}
                onToggleCollapse={onToggleCollapse}
                onToggleSelect={onToggleSelect}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

function collectParentIds(nodes: MethodTreeNode<Method>[]): string[] {
  const ids: string[] = [];
  function walk(ns: MethodTreeNode<Method>[]) {
    for (const n of ns) {
      if (n.children.length > 0) {
        ids.push(n.method.id);
        walk(n.children);
      }
    }
  }
  walk(nodes);
  return ids;
}
