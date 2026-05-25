"use client";

import { useMemo, useState, useTransition } from "react";
import { Layers } from "lucide-react";
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
  buildMethodTree,
  flattenMethodTree,
} from "@/lib/taxonomy/method-codes";
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

const NO_PARENT = "__none__";

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
  const [parentId, setParentId] = useState<string>(
    method?.parentId ?? NO_PARENT
  );
  const [description, setDescription] = useState(method?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const flat = useMemo(
    () => flattenMethodTree(buildMethodTree(allMethods)),
    [allMethods]
  );

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

  const parentOptions = flat.filter((n) => !blockedIds.has(n.method.id));

  const selectedParent = parentOptions.find((n) => n.method.id === parentId);

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
            <Select
              value={parentId}
              onValueChange={(v) => setParentId(v ?? NO_PARENT)}
            >
              <SelectTrigger id="method-parent" className="w-full">
                <SelectValue placeholder="Tanlang">
                  {(value) => {
                    if (!value || value === NO_PARENT) {
                      return (
                        <span className="flex items-center gap-2">
                          <Layers
                            className="size-3.5 text-muted-foreground"
                            aria-hidden
                          />
                          Asosiy metod
                        </span>
                      );
                    }
                    return selectedParent?.method.name ?? "Tanlang";
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-[320px]">
                <SelectItem value={NO_PARENT}>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Layers className="size-3.5 shrink-0" aria-hidden />
                    <span>Asosiy metod</span>
                  </span>
                </SelectItem>
                {parentOptions.map(({ method: m, depth }) => (
                  <SelectItem key={m.id} value={m.id}>
                    <ParentRow name={m.name} depth={depth} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

function ParentRow({
  name,
  depth,
}: {
  name: string;
  depth: number;
}) {
  return (
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
  );
}
