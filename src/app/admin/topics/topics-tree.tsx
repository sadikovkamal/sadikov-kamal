"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
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
                  onOpenLeaf: (code) =>
                    router.push(`/admin/problems?topic=${code}`),
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
  onOpenLeaf,
}: {
  nodes: TopicTreeNode<TopicWithCount>[];
  depth: number;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  /** Navigate to the problems list filtered by this leaf topic's code. */
  onOpenLeaf: (code: string) => void;
}): React.ReactNode[] {
  const rows: React.ReactNode[] = [];
  for (const node of nodes) {
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.topic.id);
    const Chevron = isCollapsed ? ChevronRight : ChevronDown;

    // Whole-row activation. Parents toggle; leaves jump to the filtered
    // problems list. Same handler on click and on Enter/Space so the
    // table is keyboard-navigable without surprising the user with a
    // separate trigger.
    const activate = () => {
      if (hasChildren) onToggle(node.topic.id);
      else onOpenLeaf(node.topic.code);
    };

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
        aria-label={
          hasChildren
            ? `${node.topic.name} — ${isCollapsed ? "ochish" : "yopish"}`
            : `${node.topic.name} — masalalarini ko'rish`
        }
        aria-expanded={hasChildren ? !isCollapsed : undefined}
        onClick={activate}
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
              // Chevron is purely decorative now — the row itself is the
              // hit target. Keep it as a <span> so nested-button warnings
              // don't fire and the row's keyboard behavior isn't
              // intercepted by an inner button.
              <span
                className="size-5 inline-flex items-center justify-center text-muted-foreground group-hover:text-foreground transition-colors shrink-0"
                aria-hidden
              >
                <Chevron className="size-3.5" />
              </span>
            ) : (
              // Spacer so leaf nodes line up with parent labels.
              <span
                className="size-5 inline-flex items-center justify-center shrink-0"
                aria-hidden
              >
                <span className="size-1 rounded-full bg-muted-foreground/30" />
              </span>
            )}
            {/* Inline chip — only the topic name area carries a visible
                background, instead of the whole row tinting on hover.
                Stays tight around the text so siblings read as a list of
                chips rather than a striped table. */}
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
        <td className="px-3 py-2 pr-3 text-right">
          {/* Edit button must not trigger the row click (which would
              toggle/navigate). stopPropagation on both the pointer
              event and the surrounding wrapper. */}
          <span
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(node.topic.id);
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              <Pencil data-icon="inline-start" />
              Tahrirlash
            </Button>
          </span>
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
          onOpenLeaf,
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
