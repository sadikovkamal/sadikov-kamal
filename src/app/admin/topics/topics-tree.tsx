"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
          className="flex items-center justify-between py-2 hover:bg-muted px-2 rounded-md"
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium truncate">{node.name}</span>
            <span className="text-xs text-muted-foreground font-mono">
              {node.slug}
            </span>
            <Badge variant="outline">{node.problemCount}</Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditingId(node.id)}
          >
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
      <Button onClick={() => setEditingId("new")}>+ Yangi mavzu</Button>

      <div className="border rounded-md">
        {roots.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground text-center">
            Hozircha mavzular yo&apos;q. Yuqoridan birinchisini qo&apos;shing.
          </div>
        )}
        {roots.map((r) => renderNode(r))}
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
