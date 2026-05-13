"use client";

import { useMemo, useState } from "react";
import { FolderTree, Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TopicEditDialog, type TopicShape } from "./topic-edit-dialog";
import type { TopicWithCount } from "@/lib/taxonomy/queries";

export function TopicsTree({ topics }: { topics: TopicWithCount[] }) {
  const [editingId, setEditingId] = useState<string | "new" | null>(null);

  const byParent = useMemo(() => {
    const map = new Map<string | null, TopicWithCount[]>();
    for (const t of topics) {
      const arr = map.get(t.parentId) ?? [];
      arr.push(t);
      map.set(t.parentId, arr);
    }
    return map;
  }, [topics]);

  const roots = byParent.get(null) ?? [];

  function renderNode(node: TopicWithCount, depth = 0): React.ReactNode {
    const children = byParent.get(node.id) ?? [];
    return (
      <div key={node.id}>
        <div
          className="group flex items-center justify-between gap-2 py-2 px-2 hover:bg-muted/60 rounded-md transition-colors"
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {depth > 0 && (
              <span
                className="text-muted-foreground/40 select-none"
                aria-hidden
              >
                ↳
              </span>
            )}
            <span className="text-sm font-medium truncate">{node.name}</span>
            <code className="text-[11px] text-muted-foreground font-mono">
              {node.slug}
            </code>
            <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
              {node.problemCount} ta
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditingId(node.id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Pencil data-icon="inline-start" />
            Tahrirlash
          </Button>
        </div>
        {children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  }

  const editingTopic =
    editingId !== null && editingId !== "new"
      ? topics.find((t) => t.id === editingId)
      : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground tabular-nums">
          {topics.length} ta mavzu
        </p>
        <Button size="sm" onClick={() => setEditingId("new")}>
          <Plus data-icon="inline-start" />
          Yangi mavzu
        </Button>
      </div>

      <div className="rounded-xl ring-1 ring-foreground/10 bg-card shadow-sm overflow-hidden">
        {roots.length === 0 ? (
          <div className="px-6 py-12 text-center space-y-2">
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
          <div className="p-1.5">{roots.map((r) => renderNode(r))}</div>
        )}
      </div>

      {editingId !== null && (
        <TopicEditDialog
          mode={editingId === "new" ? "create" : "edit"}
          topic={editingTopic as TopicShape | undefined}
          allTopics={topics}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}
