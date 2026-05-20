"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FolderTree,
  Plus,
  Pencil,
  Minus,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildTopicTree } from "@/lib/taxonomy/topic-codes";
import type { TopicTreeNode } from "@/lib/taxonomy/topic-codes";
import { TopicEditDialog, type TopicShape } from "./topic-edit-dialog";
import { TopicImportDialog } from "./topic-import-dialog";
import type { TopicWithCount } from "@/lib/taxonomy/queries";

/**
 * Mathnet MIT–style topic explorer. Pure visual hierarchy: chevrons +
 * indentation, no numeric path column. Roots are expanded by default so
 * the whole tree is visible on first load; users can collapse branches
 * they're not working on.
 */
export function TopicsTree({ topics }: { topics: TopicWithCount[] }) {
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // Build the tree once; flatten happens at render based on the expanded
  // set so collapse/expand stays cheap.
  const tree = useMemo(() => buildTopicTree(topics), [topics]);

  const allParentIds = useMemo(() => collectParentIds(tree), [tree]);

  // Default: everything collapsed. With ~175 seeded topics the fully
  // expanded view is a wall of text; admins overwhelmingly want to start
  // at the root level and drill down to what they need. The "Hammasini
  // ochish" button is one click away if they want the old behavior.
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(allParentIds)
  );

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

  const editingTopic =
    editingId !== null && editingId !== "new"
      ? topics.find((t) => t.id === editingId)
      : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground tabular-nums">
          {topics.length} ta mavzu
        </p>
        <div className="flex items-center gap-2">
          {allParentIds.length > 0 && (
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
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
          >
            <Upload data-icon="inline-start" />
            XLSX import
          </Button>
          <Button size="sm" onClick={() => setEditingId("new")}>
            <Plus data-icon="inline-start" />
            Yangi mavzu
          </Button>
        </div>
      </div>

      {tree.length === 0 ? (
        <div className="rounded-xl ring-1 ring-foreground/10 bg-card shadow-sm px-6 py-12 text-center space-y-2">
          <FolderTree
            className="size-7 mx-auto text-muted-foreground"
            aria-hidden
            strokeWidth={1.5}
          />
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Mavzular topilmadi</p>
            <p className="text-xs text-muted-foreground">
              {"Yuqoridagi tugma orqali birinchi mavzuni qo'shing."}
            </p>
          </div>
        </div>
      ) : (
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
                  <th className="w-24 px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {renderRows({
                  nodes: tree,
                  depth: 0,
                  collapsed,
                  onToggle: toggle,
                  onEdit: (id) => setEditingId(id),
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editingId !== null && (
        <TopicEditDialog
          mode={editingId === "new" ? "create" : "edit"}
          topic={editingTopic as TopicShape | undefined}
          allTopics={topics}
          onClose={() => setEditingId(null)}
        />
      )}

      <TopicImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

function renderRows({
  nodes,
  depth,
  collapsed,
  onToggle,
  onEdit,
}: {
  nodes: TopicTreeNode<TopicWithCount>[];
  depth: number;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
}): React.ReactNode[] {
  const rows: React.ReactNode[] = [];
  for (const node of nodes) {
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.topic.id);
    const Chevron = isCollapsed ? ChevronRight : ChevronDown;

    rows.push(
      <tr
        key={node.topic.id}
        className="group hover:bg-muted/40 transition-colors"
      >
        <td className="px-3 py-2.5 whitespace-nowrap">
          <code className="font-mono text-xs tabular-nums text-muted-foreground">
            {node.topic.code}
          </code>
        </td>
        <td className="px-3 py-2.5">
          <div
            className="flex items-center gap-1.5 min-w-0"
            style={{ paddingLeft: `${depth * 20}px` }}
          >
            {hasChildren ? (
              <button
                type="button"
                onClick={() => onToggle(node.topic.id)}
                aria-label={
                  isCollapsed ? `${node.topic.name}ni ochish` : `${node.topic.name}ni yopish`
                }
                aria-expanded={!isCollapsed}
                className="size-5 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
              >
                <Chevron className="size-3.5" aria-hidden />
              </button>
            ) : (
              // Spacer so leaf nodes line up with parent labels.
              <span
                className="size-5 inline-flex items-center justify-center shrink-0"
                aria-hidden
              >
                <span className="size-1 rounded-full bg-muted-foreground/30" />
              </span>
            )}
            <span className="font-medium truncate">{node.topic.name}</span>
          </div>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
          {node.topic.problemCount}
        </td>
        <td className="px-3 py-2.5 pr-3 text-right">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(node.topic.id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Pencil data-icon="inline-start" />
            Tahrirlash
          </Button>
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
          onEdit,
        })
      );
    }
  }
  return rows;
}

/** Walk the tree once to collect every node id that actually has children. */
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
