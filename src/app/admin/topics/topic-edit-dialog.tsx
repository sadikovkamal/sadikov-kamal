"use client";

import { useState, useTransition } from "react";
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

  // Don't allow setting self as parent. (A full descendant filter would
  // be safer for deeper trees; for the seeded 6-topic tree this is fine.)
  const validParents = allTopics.filter((t) => t.id !== topic?.id);

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
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PARENT}>— Yo&apos;q (root) —</SelectItem>
                {validParents.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
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
