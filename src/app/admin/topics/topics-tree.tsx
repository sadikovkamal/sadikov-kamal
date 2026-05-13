"use client";

import { useMemo, useState } from "react";
import { FolderTree, Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildTopicTree,
  flattenTopicTree,
} from "@/lib/taxonomy/topic-codes";
import { TopicEditDialog, type TopicShape } from "./topic-edit-dialog";
import type { TopicWithCount } from "@/lib/taxonomy/queries";

export function TopicsTree({ topics }: { topics: TopicWithCount[] }) {
  const [editingId, setEditingId] = useState<string | "new" | null>(null);

  // Build a tree once, flatten back into a depth-first list so the table
  // renders row-by-row but each row knows its indent + computed path.
  const flat = useMemo(() => flattenTopicTree(buildTopicTree(topics)), [topics]);

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

      {flat.length === 0 ? (
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
                  <th className="text-left font-medium px-3 py-2 w-[100px] whitespace-nowrap">
                    Pog&apos;ona
                  </th>
                  <th className="text-left font-medium px-3 py-2">Mavzu</th>
                  <th className="text-right font-medium px-3 py-2 w-[120px] whitespace-nowrap">
                    Masalalar
                  </th>
                  <th className="w-24 px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {flat.map(({ topic, path, depth }) => (
                  <tr
                    key={topic.id}
                    className="group hover:bg-muted/40 transition-colors"
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <code className="font-mono text-xs tabular-nums text-muted-foreground">
                        {topic.code}
                      </code>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <code className="font-mono text-xs tabular-nums text-muted-foreground/80">
                        {path}
                      </code>
                    </td>
                    <td className="px-3 py-2.5">
                      <div
                        className="flex items-center gap-2 min-w-0"
                        style={{ paddingLeft: `${depth * 18}px` }}
                      >
                        {depth > 0 && (
                          <span
                            className="text-muted-foreground/40 select-none"
                            aria-hidden
                          >
                            ↳
                          </span>
                        )}
                        <span className="font-medium truncate">
                          {topic.name}
                        </span>
                        <code className="text-[11px] text-muted-foreground font-mono">
                          {topic.slug}
                        </code>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                      {topic.problemCount}
                    </td>
                    <td className="px-3 py-2.5 pr-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingId(topic.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Pencil data-icon="inline-start" />
                        Tahrirlash
                      </Button>
                    </td>
                  </tr>
                ))}
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
    </div>
  );
}
