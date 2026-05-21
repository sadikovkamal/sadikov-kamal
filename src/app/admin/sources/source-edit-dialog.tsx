"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { ImagePlus, Layers, Loader2, X } from "lucide-react";
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
  buildSourceTree,
  flattenSourceTree,
} from "@/lib/taxonomy/source-codes";
import { uploadImageAction } from "@/app/admin/_actions/upload-image";
import {
  createSourceAction,
  updateSourceAction,
  deleteSourceAction,
} from "./_actions";
import { SourceLogo } from "./source-logo";

export interface SourceShape {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  logoStorageKey: string | null;
  logoPublicUrl: string | null;
  description: string | null;
}

const NO_PARENT = "__none__";

export function SourceEditDialog({
  mode,
  source,
  allSources,
  defaultParentId,
  onClose,
}: {
  mode: "create" | "edit";
  source?: SourceShape;
  allSources: SourceShape[];
  /** When opening "Yangi manba" inside a parent view, pre-fill the
   *  parent picker with that parent's id. Ignored in edit mode. */
  defaultParentId?: string | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(source?.name ?? "");
  const [parentId, setParentId] = useState<string>(
    source?.parentId ?? defaultParentId ?? NO_PARENT
  );
  const [logoStorageKey, setLogoStorageKey] = useState<string | null>(
    source?.logoStorageKey ?? null
  );
  const [logoPublicUrl, setLogoPublicUrl] = useState<string | null>(
    source?.logoPublicUrl ?? null
  );
  const [description, setDescription] = useState(source?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const flat = useMemo(
    () => flattenSourceTree(buildSourceTree(allSources)),
    [allSources]
  );

  const blockedIds = useMemo(() => {
    if (!source) return new Set<string>();
    const childrenByParent = new Map<string, string[]>();
    for (const s of allSources) {
      if (s.parentId) {
        const arr = childrenByParent.get(s.parentId) ?? [];
        arr.push(s.id);
        childrenByParent.set(s.parentId, arr);
      }
    }
    const blocked = new Set<string>([source.id]);
    const queue = [source.id];
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
  }, [allSources, source]);

  const parentOptions = flat.filter((n) => !blockedIds.has(n.source.id));
  const selectedParent = parentOptions.find((n) => n.source.id === parentId);

  function onSave() {
    setError(null);
    const payload = {
      name: name.trim(),
      parentId: parentId === NO_PARENT ? null : parentId,
      logoStorageKey,
      description: description.trim() || null,
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
          <DialogTitle className="flex items-center gap-2">
            {mode === "create" ? "Yangi manba" : "Manbani tahrirlash"}
            {mode === "edit" && source && (
              <code className="font-mono text-xs tabular-nums text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {source.code}
              </code>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="source-name">Nomi</Label>
            <Input
              id="source-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Masalan: IMO 2025"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="source-parent">Parent</Label>
            <Select
              value={parentId}
              onValueChange={(v) => setParentId(v ?? NO_PARENT)}
            >
              <SelectTrigger id="source-parent" className="w-full">
                <SelectValue placeholder="Tanlang">
                  {(value) => {
                    if (!value || value === NO_PARENT) {
                      return (
                        <span className="flex items-center gap-2">
                          <Layers
                            className="size-3.5 text-muted-foreground"
                            aria-hidden
                          />
                          Asosiy manba
                        </span>
                      );
                    }
                    return selectedParent?.source.name ?? "Tanlang";
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-[320px]">
                <SelectItem value={NO_PARENT}>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Layers className="size-3.5 shrink-0" aria-hidden />
                    <span>Asosiy manba</span>
                  </span>
                </SelectItem>
                {parentOptions.map(({ source: s, depth }) => (
                  <SelectItem key={s.id} value={s.id}>
                    <ParentRow name={s.name} depth={depth} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Logo — optional. Uploaded immediately on file pick; the
              form just stores the resulting storage_key. */}
          <div className="space-y-1">
            <Label>Logo (ixtiyoriy)</Label>
            <LogoPicker
              name={name || source?.name || "?"}
              currentKey={logoStorageKey}
              currentUrl={logoPublicUrl}
              uploadPrefix={`sources/${source?.id ?? "draft"}`}
              onChange={(key, url) => {
                setLogoStorageKey(key);
                setLogoPublicUrl(url);
              }}
            />
          </div>

          {/* Description — free-form admin notes. Shown only in the
              info modal on /admin/sources, so this is the one place
              admins fill it in. Optional. */}
          <div className="space-y-1">
            <Label htmlFor="source-description">Ma&apos;lumot (ixtiyoriy)</Label>
            <Textarea
              id="source-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Manba haqida qo'shimcha izoh, havola, eslatma…"
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

// --- Logo picker -------------------------------------------------------------

function LogoPicker({
  name,
  currentKey,
  currentUrl,
  uploadPrefix,
  onChange,
}: {
  name: string;
  currentKey: string | null;
  currentUrl: string | null;
  uploadPrefix: string;
  onChange: (storageKey: string | null, publicUrl: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("prefix", uploadPrefix);
      const res = await uploadImageAction(fd);
      if ("success" in res && res.success) {
        onChange(res.storageKey, res.publicUrl);
      } else {
        setError(res.error ?? "Yuklab bo'lmadi");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yuklab bo'lmadi");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      {/* Preview */}
      {currentUrl ? (
        <div className="relative size-12 rounded-lg overflow-hidden ring-1 ring-foreground/10 bg-card shrink-0">
          <Image
            src={currentUrl}
            alt="Logo preview"
            fill
            sizes="48px"
            className="object-cover"
          />
        </div>
      ) : (
        <SourceLogo name={name} publicUrl={null} size="md" />
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? (
          <Loader2 data-icon="inline-start" className="animate-spin" />
        ) : (
          <ImagePlus data-icon="inline-start" />
        )}
        {uploading
          ? "Yuklanmoqda…"
          : currentKey
            ? "Almashtirish"
            : "Logo yuklash"}
      </Button>

      {currentKey && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(null, null)}
          disabled={uploading}
          className="text-muted-foreground"
        >
          <X data-icon="inline-start" />
          Olib tashlash
        </Button>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function ParentRow({ name, depth }: { name: string; depth: number }) {
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

