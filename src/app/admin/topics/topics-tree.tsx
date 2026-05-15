"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TopicEditDialog, type TopicShape } from "./topic-edit-dialog";
import type { TopicWithCount } from "@/lib/taxonomy/queries";

export function TopicsTree({ topics }: { topics: TopicWithCount[] }) {
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderNode(node: TopicWithCount, depth = 0): React.ReactNode {
    const children = byParent.get(node.id) ?? [];
    const hasChildren = children.length > 0;
    const isOpen = expanded.has(node.id);

    return (
      <div key={node.id}>
        <div
          className="group flex items-center gap-2 py-2 pr-2 hover:bg-muted/60 rounded-md transition-colors"
          style={{ paddingLeft: `${depth * 20 + 4}px` }}
        >
          {/* Chevron toggle — only this controls expand/collapse */}
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleExpand(node.id)}
              aria-label={isOpen ? "Yopish" : "Ochish"}
              aria-expanded={isOpen}
              className="size-6 shrink-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <ChevronRight
                className={cn(
                  "size-4 transition-transform",
                  isOpen && "rotate-90"
                )}
                aria-hidden
              />
            </button>
          ) : (
            <span className="size-6 shrink-0" aria-hidden />
          )}

          {/* Name — navigates to detail page */}
          <Link
            href={`/admin/topics/${node.id}`}
            className="flex items-center gap-2 min-w-0 flex-1 hover:text-[var(--accent-brand-strong)] transition-colors"
          >
            <span className="font-medium truncate">{node.name}</span>
            <span className="text-xs text-muted-foreground font-mono truncate">
              {node.slug}
            </span>
            <Badge variant="outline" className="ml-auto shrink-0">
              {node.problemCount}
            </Badge>
          </Link>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditingId(node.id)}
          >
            Tahrirlash
          </Button>
        </div>
        {hasChildren && isOpen && children.map((c) => renderNode(c, depth + 1))}
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

      <div className="border rounded-md p-1">
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
