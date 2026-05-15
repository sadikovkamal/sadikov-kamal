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
  createAgeCategoryAction,
  updateAgeCategoryAction,
  deleteAgeCategoryAction,
} from "./_actions";

export interface AgeCategoryShape {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

export function AgeCategoryEditDialog({
  mode,
  category,
  onClose,
}: {
  mode: "create" | "edit";
  category?: AgeCategoryShape;
  onClose: () => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSave() {
    setError(null);
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
    };
    startTransition(async () => {
      const res =
        mode === "create"
          ? await createAgeCategoryAction(payload)
          : await updateAgeCategoryAction(category!.id, payload);
      if ("error" in res) setError(res.error);
      else onClose();
    });
  }

  function onDelete() {
    if (!category) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteAgeCategoryAction(category.id);
      if ("error" in res) setError(res.error);
      else onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "create" ? "Yangi yosh toifasi" : "Yosh toifasini tahrirlash"}
            {mode === "edit" && category && (
              <code className="font-mono text-xs tabular-nums text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {category.code}
              </code>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="age-cat-name">Nomi</Label>
            <Input
              id="age-cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Masalan: Talaba, 8-sinf, Professional"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="age-cat-desc">Ta&apos;rifi (ixtiyoriy)</Label>
            <Textarea
              id="age-cat-desc"
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
