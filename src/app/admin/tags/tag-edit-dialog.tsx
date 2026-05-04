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
import { slugify } from "@/lib/utils/slug";
import {
  createTagAction,
  updateTagAction,
  deleteTagAction,
} from "./_actions";

export interface TagShape {
  id: string;
  name: string;
  slug: string;
}

export function TagEditDialog({
  mode,
  tag,
  onClose,
}: {
  mode: "create" | "edit";
  tag?: TagShape;
  onClose: () => void;
}) {
  const [name, setName] = useState(tag?.name ?? "");
  const [slug, setSlug] = useState(tag?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
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
      slug: (slug.trim() || slugify(name)),
    };
    startTransition(async () => {
      const res =
        mode === "create"
          ? await createTagAction(payload)
          : await updateTagAction(tag!.id, payload);
      if ("error" in res) setError(res.error);
      else onClose();
    });
  }

  function onDelete() {
    if (!tag) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteTagAction(tag.id);
      if ("error" in res) setError(res.error);
      else onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Yangi teg" : "Tegni tahrirlash"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="tag-name">Nomi</Label>
            <Input
              id="tag-name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tag-slug">Slug</Label>
            <Input
              id="tag-slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugTouched(true);
              }}
              placeholder="masalan: am-gm"
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
