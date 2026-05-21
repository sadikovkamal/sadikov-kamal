"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildTopicTree, type TopicTreeNode } from "@/lib/taxonomy/topic-codes";
import type { TopicWithCount } from "@/lib/taxonomy/queries";

/**
 * Twin of /admin/sources/[code]/source-topics-tree, but scoped to a
 * single age category instead of a source. Per product decision the
 * navigation target uses ONLY (topic × ageCategory) — no source filter
 * — so admins see every problem in this age band for the chosen topic
 * regardless of where the problem came from.
 */
export function AgeCategoryTopicsTree({
  topics,
  ageCategoryCode,
  selectedSourceCodes = [],
}: {
  topics: TopicWithCount[];
  ageCategoryCode: string;
  /** Currently selected source codes from the page's filter. The
   *  click-through preserves them so the resulting problems list
   *  shows the same (age × sources × topic) intersection the user
   *  was looking at. */
  selectedSourceCodes?: string[];
}) {
  const router = useRouter();
  const tree = useMemo(() => buildTopicTree(topics), [topics]);
  const allParentIds = useMemo(() => collectParentIds(tree), [tree]);

  // Pre-filtered tree is small; start fully expanded so the user
  // doesn't have to click into every branch.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const allCollapsed = collapsed.size === allParentIds.length;

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function collapseAll() {
    setCollapsed(new Set(allParentIds));
  }
  function expandAll() {
    setCollapsed(new Set());
  }

  function openProblems(topicCode: string) {
    // ageCategory + topic, plus whatever sources the page's filter
    // currently has selected — so the resulting problems list is the
    // same intersection the user was looking at on this page.
    const params = new URLSearchParams();
    params.set("ageCategory", ageCategoryCode);
    params.set("topic", topicCode);
    if (selectedSourceCodes.length > 0) {
      params.set("source", selectedSourceCodes.join(","));
    }
    router.push(`/admin/problems?${params.toString()}`);
  }

  return (
    <div className="space-y-3">
      {allParentIds.length > 0 && (
        <div className="flex items-center justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={allCollapsed ? expandAll : collapseAll}
            className="text-xs text-muted-foreground"
          >
            {allCollapsed ? (
              <>
                <Plus data-icon="inline-start" />
                Hammasini ochish
              </>
            ) : (
              <>
                <Minus data-icon="inline-start" />
                Hammasini yopish
              </>
            )}
          </Button>
        </div>
      )}

      <div className="rounded-xl ring-1 ring-foreground/10 bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="text-left font-medium px-3 py-2 w-[110px] whitespace-nowrap">
                  Kod
                </th>
                <th className="text-left font-medium px-3 py-2">Mavzu</th>
                <th className="text-right font-medium px-3 py-2 w-[120px] whitespace-nowrap">
                  Masalalar
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {renderRows({
                nodes: tree,
                depth: 0,
                collapsed,
                onToggle: toggle,
                onOpen: openProblems,
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function renderRows({
  nodes,
  depth,
  collapsed,
  onToggle,
  onOpen,
}: {
  nodes: TopicTreeNode<TopicWithCount>[];
  depth: number;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (topicCode: string) => void;
}): React.ReactNode[] {
  const rows: React.ReactNode[] = [];
  for (const node of nodes) {
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.topic.id);
    const Chevron = isCollapsed ? ChevronRight : ChevronDown;

    const activate = () => onOpen(node.topic.code);

    rows.push(
      <tr
        key={node.topic.id}
        className={
          "group cursor-pointer transition-colors " +
          "hover:bg-muted/30 focus-visible:bg-muted/40 " +
          "focus:outline-none focus-visible:ring-2 " +
          "focus-visible:ring-[var(--accent-brand)]"
        }
        role="button"
        tabIndex={0}
        aria-label={`${node.topic.name} — masalalarini ochish`}
        aria-expanded={hasChildren ? !isCollapsed : undefined}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("[data-chevron]")) return;
          activate();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            activate();
          }
        }}
      >
        <td className="px-3 py-2 whitespace-nowrap">
          <code className="font-mono text-xs tabular-nums text-muted-foreground">
            {node.topic.code}
          </code>
        </td>
        <td className="px-3 py-2">
          <div
            className="flex items-center gap-1.5 min-w-0"
            style={{ paddingLeft: `${depth * 20}px` }}
          >
            {hasChildren ? (
              <button
                type="button"
                data-chevron
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(node.topic.id);
                }}
                aria-label={
                  isCollapsed
                    ? `${node.topic.name}ni ochish`
                    : `${node.topic.name}ni yopish`
                }
                className="size-5 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0 cursor-pointer"
              >
                <Chevron className="size-3.5" aria-hidden />
              </button>
            ) : (
              <span
                className="size-5 inline-flex items-center justify-center shrink-0"
                aria-hidden
              >
                <span className="size-1 rounded-full bg-muted-foreground/30" />
              </span>
            )}
            <span
              className={
                "inline-flex items-center min-w-0 max-w-full " +
                "rounded-md bg-muted/50 ring-1 ring-foreground/5 " +
                "px-2 py-1 text-sm font-medium " +
                "group-hover:bg-muted group-hover:ring-foreground/10 " +
                "transition-colors"
              }
            >
              <span className="truncate">{node.topic.name}</span>
            </span>
          </div>
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">
          {node.topic.problemCount}
        </td>
      </tr>
    );

    if (hasChildren && !isCollapsed) {
      rows.push(
        ...renderRows({
          nodes: node.children,
          depth: depth + 1,
          collapsed,
          onToggle,
          onOpen,
        })
      );
    }
  }
  return rows;
}

function collectParentIds(
  nodes: TopicTreeNode<TopicWithCount>[]
): string[] {
  const ids: string[] = [];
  function walk(ns: TopicTreeNode<TopicWithCount>[]) {
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
