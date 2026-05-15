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
import { slugify } from "@/lib/utils/slug";
import {
  createAgeCategoryAction,
  updateAgeCategoryAction,
  deleteAgeCategoryAction,
} from "./_actions";

export interface AgeCategoryShape {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
}

export function AgeCategoryEditDialog({
  mode,
  ageCategory,
  onClose,
}: {
  mode: "create" | "edit";
  ageCategory?: AgeCategoryShape;
  onClose: () => void;
}) {
  const [name, setName] = useState(ageCategory?.name ?? "");
  const [slug, setSlug] = useState(ageCategory?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [description, setDescription] = useState(
    ageCategory?.description ?? ""
  );
  const [sortOrder, setSortOrder] = useState<number>(
    ageCategory?.sortOrder ?? 0
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function onSave() {
    setError(null);
    const payload = {
      name: name.trim(),
      slug: slug.trim() || slugify(name),
      description: description.trim() || null,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    };
    startTransition(async () => {
      const res =
        mode === "create"
          ? await createAgeCategoryAction(payload)
          : await updateAgeCategoryAction(ageCategory!.id, payload);
      if ("error" in res) setError(res.error);
      else onClose();
    });
  }

  function onDelete() {
    if (!ageCategory) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteAgeCategoryAction(ageCategory.id);
      if ("error" in res) setError(res.error);
      else onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Yangi yosh toifasi" : "Yosh toifasini tahrirlash"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="age-name">Nomi</Label>
            <Input
              id="age-name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="masalan: Boshlang'ich"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="age-slug">Slug</Label>
            <Input
              id="age-slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugTouched(true);
              }}
              placeholder="masalan: boshlangich"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="age-description">Tavsif (ixtiyoriy)</Label>
            <Textarea
              id="age-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Toifaning qisqacha tavsifi"
              rows={2}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="age-sort">Tartib raqami</Label>
            <Input
              id="age-sort"
              type="number"
              value={sortOrder}
              onChange={(e) =>
                setSortOrder(Number.parseInt(e.target.value, 10) || 0)
              }
              min={0}
              max={9999}
            />
            <p className="text-xs text-muted-foreground">
              Kichik raqam birinchi turadi. Toifalar alifbo emas, shu raqam
              bo&apos;yicha tartiblanadi.
            </p>
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
