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
import { buildTopicTree, type TopicTreeNode } from "@/lib/taxonomy/topic-codes";
import { parentIdSet } from "@/lib/taxonomy/hierarchy";
import type { Topic } from "@/db/schema";

/**
 * Multi-select picker that mirrors /admin/topics: nested tree with
 * chevron expand/collapse, plus a checkbox per row. Rendered inside a
 * popover so the form stays compact when the picker isn't open.
 *
 * - Default collapsed so the first impression is the root taxonomy.
 * - Search filters by name (case-insensitive); matches auto-expand
 *   ancestors so the row stays visible.
 * - Selected topics are shown as removable badges below the trigger.
 */
export function TopicTreePicker({
  available,
  value,
  onChange,
}: {
  available: Topic[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const tree = useMemo(() => buildTopicTree(available), [available]);

  // Parents (have children) can't hold a problem — render them
  // disabled and silently filter them out of `value` so stale drafts
  // don't keep the user stuck on a forbidden id.
  const parentSet = useMemo(
    () =>
      parentIdSet(
        available.map((t) => ({ id: t.id, parentId: t.parentId }))
      ),
    [available]
  );

  // Collapsed set — start with all parents collapsed.
  const allParentIds = useMemo(() => collectParentIds(tree), [tree]);
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(allParentIds)
  );

  // When searching, force-expand ancestors of every matching node so
  // results are visible even if their parent was collapsed.
  const searchLower = search.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!searchLower) {
      return { allow: null as Set<string> | null, expandedExtra: new Set<string>() };
    }
    const allow = new Set<string>();
    const expandedExtra = new Set<string>();
    function walk(node: TopicTreeNode<Topic>, ancestors: string[]) {
      const matches = node.topic.name.toLowerCase().includes(searchLower);
      if (matches) {
        allow.add(node.topic.id);
        for (const a of ancestors) {
          allow.add(a);
          expandedExtra.add(a);
        }
      }
      for (const child of node.children) {
        walk(child, [...ancestors, node.topic.id]);
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
      // Always allow removal — so stale parent ids in `value` can be cleared.
      onChange(value.filter((v) => v !== id));
      return;
    }
    // Refuse to add a parent — leaf-only rule.
    if (parentSet.has(id)) return;
    onChange([...value, id]);
  }

  const selected = available.filter(
    (t) => value.includes(t.id) && !parentSet.has(t.id)
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
                  ? "Mavzularni tanlang…"
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
          {/* Search bar */}
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search
              className="size-3.5 text-muted-foreground shrink-0"
              aria-hidden
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Mavzu qidirish…"
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
          </div>

          {/* Tree */}
          <div className="max-h-[320px] overflow-auto py-1">
            {tree.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                Mavzular topilmadi
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

      {/* Selected badges */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((t) => (
            <Badge key={t.id} variant="secondary" className="gap-1">
              {t.name}
              <button
                type="button"
                aria-label={`${t.name} ni olib tashlash`}
                onClick={() => toggleSelect(t.id)}
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
  nodes: TopicTreeNode<Topic>[];
  depth: number;
  collapsed: Set<string>;
  /** Ancestor IDs that should be temporarily expanded because of a search match. */
  expandedExtra: Set<string>;
  /** When set, only nodes whose IDs are in this set may render. */
  allow: Set<string> | null;
  selectedIds: string[];
  /** Parents — render disabled and ignore clicks on their row body. */
  parentSet: Set<string>;
  onToggleCollapse: (id: string) => void;
  onToggleSelect: (id: string) => void;
}): React.ReactNode {
  return (
    <>
      {nodes.map((node) => {
        if (allow && !allow.has(node.topic.id)) return null;
        const hasChildren = node.children.length > 0;
        const isCollapsed =
          collapsed.has(node.topic.id) && !expandedExtra.has(node.topic.id);
        const isSelected = selectedIds.includes(node.topic.id);
        const Chevron = isCollapsed ? ChevronRight : ChevronDown;

        return (
          <div key={node.topic.id}>
            <div
              role={parentSet.has(node.topic.id) ? undefined : "button"}
              tabIndex={parentSet.has(node.topic.id) ? undefined : 0}
              className={cn(
                "group flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-sm transition-colors",
                parentSet.has(node.topic.id)
                  ? "cursor-default text-muted-foreground"
                  : "cursor-pointer hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand)]",
                isSelected && "bg-[var(--accent-brand)]/5"
              )}
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
              aria-disabled={parentSet.has(node.topic.id) || undefined}
              aria-label={
                parentSet.has(node.topic.id)
                  ? undefined
                  : isSelected
                    ? `${node.topic.name} mavzusini tanlovdan olib tashlash`
                    : `${node.topic.name} mavzusini tanlash`
              }
              title={
                parentSet.has(node.topic.id)
                  ? "Faqat ichki mavzu tanlanadi — bu guruh"
                  : undefined
              }
              onClick={() => {
                if (parentSet.has(node.topic.id)) return;
                onToggleSelect(node.topic.id);
              }}
              onKeyDown={(e) => {
                if (parentSet.has(node.topic.id)) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggleSelect(node.topic.id);
                }
              }}
            >
              {hasChildren ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleCollapse(node.topic.id);
                  }}
                  className="size-4 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground shrink-0"
                  aria-label={
                    isCollapsed
                      ? `${node.topic.name}ni ochish`
                      : `${node.topic.name}ni yopish`
                  }
                >
                  <Chevron className="size-3.5" aria-hidden />
                </button>
              ) : (
                <span className="size-4 shrink-0" aria-hidden />
              )}

              {/* Checkbox-like indicator */}
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
                {node.topic.name}
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

function collectParentIds(nodes: TopicTreeNode<Topic>[]): string[] {
  const ids: string[] = [];
  function walk(ns: TopicTreeNode<Topic>[]) {
    for (const n of ns) {
      if (n.children.length > 0) {
        ids.push(n.topic.id);
        walk(n.children);
      }
    }
  }
  walk(nodes);
  return ids;
}
