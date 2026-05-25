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
import { NestedParentPicker } from "@/components/nested-parent-picker";
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
  const [parentId, setParentId] = useState<string | null>(
    topic?.parentId ?? null
  );
  const [description, setDescription] = useState(topic?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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

  // Hand the picker only the eligible options. The picker builds its own
  // tree, so we can pass a flat filtered list — no pre-flattening here.
  const parentOptions = useMemo(
    () =>
      allTopics
        .filter((t) => !blockedIds.has(t.id))
        .map((t) => ({ id: t.id, name: t.name, parentId: t.parentId })),
    [allTopics, blockedIds]
  );

  function onSave() {
    setError(null);
    const payload = {
      name: name.trim(),
      parentId,
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
            <NestedParentPicker
              id="topic-parent"
              options={parentOptions}
              value={parentId}
              onChange={setParentId}
              noneLabel="Asosiy mavzu"
              searchPlaceholder="Mavzu qidirish…"
            />
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
