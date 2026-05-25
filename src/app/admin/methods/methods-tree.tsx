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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildMethodTree } from "@/lib/taxonomy/method-codes";
import type { MethodTreeNode } from "@/lib/taxonomy/method-codes";
import { MethodEditDialog, type MethodShape } from "./method-edit-dialog";
import type { MethodWithCount } from "@/lib/taxonomy/queries";

export function MethodsTree({ methods }: { methods: MethodWithCount[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);

  const tree = useMemo(() => buildMethodTree(methods), [methods]);
  const allParentIds = useMemo(() => collectParentIds(tree), [tree]);

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

  const editingMethod =
    editingId !== null && editingId !== "new"
      ? methods.find((m) => m.id === editingId)
      : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground tabular-nums">
          {methods.length} ta metod
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
          <Button size="sm" onClick={() => setEditingId("new")}>
            <Plus data-icon="inline-start" />
            Yangi metod
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
            <p className="text-sm font-medium">Metodlar topilmadi</p>
            <p className="text-xs text-muted-foreground">
              {"Yuqoridagi tugma orqali birinchi metodni qo'shing."}
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
                  <th className="text-left font-medium px-3 py-2">Metod</th>
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
                    router.push(`/admin/problems?method=${code}`),
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editingId !== null && (
        <MethodEditDialog
          mode={editingId === "new" ? "create" : "edit"}
          method={editingMethod as MethodShape | undefined}
          allMethods={methods}
          onClose={() => setEditingId(null)}
        />
      )}
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
  nodes: MethodTreeNode<MethodWithCount>[];
  depth: number;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  onOpenLeaf: (code: string) => void;
}): React.ReactNode[] {
  const rows: React.ReactNode[] = [];
  for (const node of nodes) {
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.method.id);
    const Chevron = isCollapsed ? ChevronRight : ChevronDown;

    const activate = () => {
      if (hasChildren) onToggle(node.method.id);
      else onOpenLeaf(node.method.code);
    };

    rows.push(
      <tr
        key={node.method.id}
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
            ? `${node.method.name} — ${isCollapsed ? "ochish" : "yopish"}`
            : `${node.method.name} — masalalarini ko'rish`
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
            {node.method.code}
          </code>
        </td>
        <td className="px-3 py-2">
          <div
            className="flex items-center gap-1.5 min-w-0"
            style={{ paddingLeft: `${depth * 20}px` }}
          >
            {hasChildren ? (
              <span
                className="size-5 inline-flex items-center justify-center text-muted-foreground group-hover:text-foreground transition-colors shrink-0"
                aria-hidden
              >
                <Chevron className="size-3.5" />
              </span>
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
              <span className="truncate">{node.method.name}</span>
            </span>
          </div>
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">
          {node.method.problemCount}
        </td>
        <td className="px-3 py-2 pr-3 text-right">
          <span
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(node.method.id);
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

function collectParentIds(
  nodes: MethodTreeNode<MethodWithCount>[]
): string[] {
  const ids: string[] = [];
  function walk(ns: MethodTreeNode<MethodWithCount>[]) {
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
