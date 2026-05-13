"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildTopicTree,
  flattenTopicTree,
} from "@/lib/taxonomy/topic-codes";
import {
  createTopicAction,
  updateTopicAction,
  deleteTopicAction,
} from "./_actions";

export interface TopicShape {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  description: string | null;
}

const NO_PARENT = "__none__";

export function TopicEditDialog({
  mode,
  topic,
  allTopics,
  onClose,
}: {
  mode: "create" | "edit";
  topic?: TopicShape;
  allTopics: TopicShape[];
  onClose: () => void;
}) {
  const [name, setName] = useState(topic?.name ?? "");
  const [parentId, setParentId] = useState<string>(topic?.parentId ?? NO_PARENT);
  const [description, setDescription] = useState(topic?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Build the topic tree once. Flatten depth-first so the parent dropdown
  // can render each row with its indent level + show "↳" markers.
  const flat = useMemo(
    () => flattenTopicTree(buildTopicTree(allTopics)),
    [allTopics]
  );

  // Block cycles: when editing, hide the topic itself and every descendant
  // from the parent picker. Without this, an admin could parent Algebra
  // under one of its own grandchildren and orphan the whole subtree.
  const blockedIds = useMemo(() => {
    if (!topic) return new Set<string>();
    const childrenByParent = new Map<string, string[]>();
    for (const t of allTopics) {
      if (t.parentId) {
        const arr = childrenByParent.get(t.parentId) ?? [];
        arr.push(t.id);
        childrenByParent.set(t.parentId, arr);
      }
    }
    const blocked = new Set<string>([topic.id]);
    const queue = [topic.id];
    while (queue.length) {
      const next = queue.shift()!;
      for (const childId of childrenByParent.get(next) ?? []) {
        if (!blocked.has(childId)) {
          blocked.add(childId);
          queue.push(childId);
        }
      }
    }
    return blocked;
  }, [allTopics, topic]);

  const parentOptions = flat.filter((n) => !blockedIds.has(n.topic.id));

  const selectedParent = parentOptions.find((n) => n.topic.id === parentId);

  function onSave() {
    setError(null);
    const payload = {
      name: name.trim(),
      parentId: parentId === NO_PARENT ? null : parentId,
      description: description.trim() || null,
    };
    startTransition(async () => {
      const res =
        mode === "create"
          ? await createTopicAction(payload)
          : await updateTopicAction(topic!.id, payload);
      if ("error" in res) {
        setError(res.error);
      } else {
        onClose();
      }
    });
  }

  function onDelete() {
    if (!topic) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteTopicAction(topic.id);
      if ("error" in res) {
        setError(res.error);
      } else {
        onClose();
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "create" ? "Yangi mavzu" : "Mavzuni tahrirlash"}
            {mode === "edit" && topic && (
              <code className="font-mono text-xs tabular-nums text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {topic.code}
              </code>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="topic-name">Nomi</Label>
            <Input
              id="topic-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Masalan: Tengsizliklar"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="topic-parent">Parent</Label>
            <Select
              value={parentId}
              onValueChange={(v) => setParentId(v ?? NO_PARENT)}
            >
              <SelectTrigger id="topic-parent" className="w-full">
                {/* Trigger shows just the picked topic's name (or root
                    sentinel) — no indent, no code chip — so the closed
                    state stays compact. */}
                <SelectValue placeholder="Tanlang">
                  {(value) => {
                    if (!value || value === NO_PARENT) return "— Yo'q (root) —";
                    return selectedParent?.topic.name ?? "Tanlang";
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-[320px]">
                <SelectItem value={NO_PARENT}>
                  <span className="text-muted-foreground">
                    — Yo&apos;q (root) —
                  </span>
                </SelectItem>
                {parentOptions.map(({ topic: t, depth }) => (
                  <SelectItem key={t.id} value={t.id}>
                    <ParentRow name={t.name} code={t.code} depth={depth} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="topic-desc">Ta&apos;rifi</Label>
            <Textarea
              id="topic-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          {mode === "edit" && (
            <Button
              variant="destructive"
              onClick={onDelete}
              disabled={isPending}
              className="mr-auto"
            >
              O&apos;chirish
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Bekor qilish
          </Button>
          <Button
            onClick={onSave}
            disabled={isPending || name.trim().length === 0}
          >
            {isPending ? "Saqlanmoqda…" : "Saqlash"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Row inside the parent dropdown. Indents by depth, prefixes nested
 * rows with a faint "↳" so the eye catches hierarchy in a long list,
 * and pins the T-code on the right as a muted chip so admins can spot
 * the exact topic when several share a name (e.g. "Boshqa").
 */
function ParentRow({
  name,
  code,
  depth,
}: {
  name: string;
  code: string;
  depth: number;
}) {
  return (
    <span className="flex items-center justify-between gap-2 w-full">
      <span
        className="flex items-center gap-1.5 min-w-0"
        style={{ paddingLeft: `${depth * 14}px` }}
      >
        {depth > 0 && (
          <span className="text-muted-foreground/40 shrink-0" aria-hidden>
            ↳
          </span>
        )}
        <span className="truncate">{name}</span>
      </span>
      <code className="font-mono text-[10px] tabular-nums text-muted-foreground/60 shrink-0">
        {code}
      </code>
    </span>
  );
}
