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
  parentId: string | null;
}

const KIND_LABELS: Record<SourceKind, string> = {
  olympiad: "Olimpiada",
  book: "Kitob",
  course: "Kurs",
  other: "Boshqa",
};

const NO_PARENT = "__none__";

export function SourceEditDialog({
  mode,
  source,
  allSources,
  onClose,
}: {
  mode: "create" | "edit";
  source?: SourceShape;
  allSources: { id: string; name: string; parentId: string | null }[];
  onClose: () => void;
}) {
  const [name, setName] = useState(source?.name ?? "");
  const [slug, setSlug] = useState(source?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [kind, setKind] = useState<SourceKind>(source?.kind ?? "olympiad");
  const [country, setCountry] = useState(source?.country ?? "");
  const [parentId, setParentId] = useState<string>(
    source?.parentId ?? NO_PARENT
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Don't allow a source to become its own descendant. Build the set of
  // descendants of the current source and exclude both the source itself
  // and any descendant from the parent dropdown.
  const forbiddenParentIds = useMemo(() => {
    if (!source) return new Set<string>();
    const forbidden = new Set<string>([source.id]);
    let added = true;
    while (added) {
      added = false;
      for (const s of allSources) {
        if (s.parentId && forbidden.has(s.parentId) && !forbidden.has(s.id)) {
          forbidden.add(s.id);
          added = true;
        }
      }
    }
    return forbidden;
  }, [source, allSources]);

  const validParents = allSources.filter((s) => !forbiddenParentIds.has(s.id));

  function onNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function onSave() {
    setError(null);
    const payload = {
      name: name.trim(),
      slug: slug.trim() || slugify(name),
      kind,
      country: country.trim() || null,
      parentId: parentId === NO_PARENT ? null : parentId,
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
            <Label htmlFor="source-parent">Parent (ixtiyoriy)</Label>
            <Select
              value={parentId}
              onValueChange={(v) => setParentId(v ?? NO_PARENT)}
            >
              <SelectTrigger id="source-parent" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PARENT}>— Yo&apos;q (root) —</SelectItem>
                {validParents.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Masalan: IMO → IMO 2020. Faqat leaf (children&apos;siz) manbalarga
              masala taglanadi.
            </p>
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
