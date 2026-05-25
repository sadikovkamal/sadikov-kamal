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
  createMethodAction,
  updateMethodAction,
  deleteMethodAction,
} from "./_actions";

export interface MethodShape {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  description: string | null;
}

export function MethodEditDialog({
  mode,
  method,
  allMethods,
  onClose,
}: {
  mode: "create" | "edit";
  method?: MethodShape;
  allMethods: MethodShape[];
  onClose: () => void;
}) {
  const [name, setName] = useState(method?.name ?? "");
  const [parentId, setParentId] = useState<string | null>(
    method?.parentId ?? null
  );
  const [description, setDescription] = useState(method?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Block cycles: when editing, hide the method itself and every descendant
  // from the parent picker (same rule as topics).
  const blockedIds = useMemo(() => {
    if (!method) return new Set<string>();
    const childrenByParent = new Map<string, string[]>();
    for (const m of allMethods) {
      if (m.parentId) {
        const arr = childrenByParent.get(m.parentId) ?? [];
        arr.push(m.id);
        childrenByParent.set(m.parentId, arr);
      }
    }
    const blocked = new Set<string>([method.id]);
    const queue = [method.id];
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
  }, [allMethods, method]);

  const parentOptions = useMemo(
    () =>
      allMethods
        .filter((m) => !blockedIds.has(m.id))
        .map((m) => ({ id: m.id, name: m.name, parentId: m.parentId })),
    [allMethods, blockedIds]
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
          ? await createMethodAction(payload)
          : await updateMethodAction(method!.id, payload);
      if ("error" in res) {
        setError(res.error);
      } else {
        onClose();
      }
    });
  }

  function onDelete() {
    if (!method) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteMethodAction(method.id);
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
            {mode === "create" ? "Yangi metod" : "Metodni tahrirlash"}
            {mode === "edit" && method && (
              <code className="font-mono text-xs tabular-nums text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {method.code}
              </code>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="method-name">Nomi</Label>
            <Input
              id="method-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Masalan: Matematik induksiya"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="method-parent">Parent</Label>
            <NestedParentPicker
              id="method-parent"
              options={parentOptions}
              value={parentId}
              onChange={setParentId}
              noneLabel="Asosiy metod"
              searchPlaceholder="Metod qidirish…"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="method-desc">Ta&apos;rifi</Label>
            <Textarea
              id="method-desc"
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
