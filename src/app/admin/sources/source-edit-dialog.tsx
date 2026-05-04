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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { slugify } from "@/lib/utils/slug";
import {
  createSourceAction,
  updateSourceAction,
  deleteSourceAction,
} from "./_actions";
import type { SourceKind } from "@/lib/taxonomy/mutations";

export interface SourceShape {
  id: string;
  name: string;
  slug: string;
  kind: SourceKind;
  country: string | null;
}

const KIND_LABELS: Record<SourceKind, string> = {
  olympiad: "Olimpiada",
  book: "Kitob",
  course: "Kurs",
  other: "Boshqa",
};

export function SourceEditDialog({
  mode,
  source,
  onClose,
}: {
  mode: "create" | "edit";
  source?: SourceShape;
  onClose: () => void;
}) {
  const [name, setName] = useState(source?.name ?? "");
  const [slug, setSlug] = useState(source?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [kind, setKind] = useState<SourceKind>(source?.kind ?? "olympiad");
  const [country, setCountry] = useState(source?.country ?? "");
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
      kind,
      country: country.trim() || null,
    };
    startTransition(async () => {
      const res =
        mode === "create"
          ? await createSourceAction(payload)
          : await updateSourceAction(source!.id, payload);
      if ("error" in res) setError(res.error);
      else onClose();
    });
  }

  function onDelete() {
    if (!source) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteSourceAction(source.id);
      if ("error" in res) setError(res.error);
      else onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Yangi manba" : "Manbani tahrirlash"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="source-name">Nomi</Label>
            <Input
              id="source-name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="source-slug">Slug</Label>
            <Input
              id="source-slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugTouched(true);
              }}
              placeholder="masalan: imo-shortlist"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="source-kind">Tur</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as SourceKind)}>
              <SelectTrigger id="source-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["olympiad", "book", "course", "other"] as SourceKind[]).map(
                  (k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_LABELS[k]}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="source-country">Davlat (ixtiyoriy)</Label>
            <Input
              id="source-country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="UZ, RU, US…"
              maxLength={50}
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
