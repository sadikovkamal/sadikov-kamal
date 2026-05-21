"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildTopicTree, type TopicTreeNode } from "@/lib/taxonomy/topic-codes";
import type { TopicWithCount } from "@/lib/taxonomy/queries";

/**
 * Mavzular daraxti — restricted to topics that actually carry problems
 * inside one specific source. Same look as /admin/topics so the
 * navigation feels familiar, with two behavioral differences:
 *
 *   1. There's no edit affordance — this is a read view.
 *   2. Clicking *any* row (parent or leaf) navigates to the problems
 *      list filtered by `source × topic`. The problems list already
 *      expands a parent topic into its descendants, so a parent click
 *      gives a cascade view of every problem under that subtree
 *      restricted to this source.
 *
 * The chevron column is purely decorative; the whole <tr> is the hit
 * target so users don't have to aim at a 14px icon.
 */
export function SourceTopicsTree({
  topics,
  sourceCode,
}: {
  topics: TopicWithCount[];
  sourceCode: string;
}) {
  const router = useRouter();
  const tree = useMemo(() => buildTopicTree(topics), [topics]);
  const allParentIds = useMemo(() => collectParentIds(tree), [tree]);

  // Default: parents OPEN here (unlike /admin/topics, which defaults to
  // collapsed). The set is pre-filtered to "topics used in this source"
  // so it's much smaller than the full 175-topic taxonomy, and the
  // user came here specifically to see what's inside — hiding rows
  // behind a collapse on first paint would just add a click for no
  // benefit.
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
    // Two URL params so the problems list filters by (source × topic).
    // The list query already expands `topic` into descendants, so a
    // parent here yields every leaf's problems in this source.
    router.push(
      `/admin/problems?source=${sourceCode}&topic=${topicCode}`
    );
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
  /** Navigate to /admin/problems with source × topic filters applied. */
  onOpen: (topicCode: string) => void;
}): React.ReactNode[] {
  const rows: React.ReactNode[] = [];
  for (const node of nodes) {
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.topic.id);
    const Chevron = isCollapsed ? ChevronRight : ChevronDown;

    // Whole-row activation: navigate to the problems list filtered by
    // this topic (cascade-expanded for parents on the server side).
    // Auxiliary clicks (Ctrl/Cmd/Middle, right-click) are left alone so
    // the user can open the result in a new tab — checking `metaKey`
    // and `ctrlKey` avoids stealing those gestures.
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
          // Don't hijack chevron clicks — clicking the chevron only
          // toggles the subtree, doesn't navigate.
          if ((e.target as HTMLElement).closest("[data-chevron]")) {
            return;
          }
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
              // Small inline button just for the chevron — stops
              // propagation so toggling doesn't double-fire navigate.
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
            {/* Inline chip — same shape as /admin/topics. */}
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
