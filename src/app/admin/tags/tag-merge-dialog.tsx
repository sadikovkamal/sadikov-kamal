"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { mergeTagAction } from "./_actions";
import type { TagWithCount } from "@/lib/taxonomy/queries";

export function TagMergeDialog({
  fromTag,
  allTags,
  onClose,
}: {
  fromTag: TagWithCount;
  allTags: TagWithCount[];
  onClose: () => void;
}) {
  const [toId, setToId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const options = allTags.filter((t) => t.id !== fromTag.id);
  const target = options.find((t) => t.id === toId);

  function onMerge() {
    if (!target) return;
    setError(null);
    startTransition(async () => {
      const res = await mergeTagAction({ fromId: fromTag.id, toId });
      if ("error" in res) setError(res.error);
      else onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tegni qo&apos;shish (merge)</DialogTitle>
          <DialogDescription>
            <strong>#{fromTag.name}</strong> tegidagi barcha {fromTag.usageCount}{" "}
            ta masala tanlangan tegga ko&apos;chiriladi va{" "}
            <strong>#{fromTag.name}</strong> o&apos;chiriladi. Bu amalni
            qaytarib bo&apos;lmaydi.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="merge-target">Manzil teg</Label>
            <Select
              value={toId}
              onValueChange={(v) => setToId(v ?? "")}
            >
              <SelectTrigger id="merge-target" className="w-full">
                <SelectValue placeholder="Tegni tanlang…" />
              </SelectTrigger>
              <SelectContent>
                {options.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    #{t.name} ({t.usageCount})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Bekor qilish
          </Button>
          <Button onClick={onMerge} disabled={isPending || !target}>
            {isPending
              ? "Birlashtirilmoqda…"
              : target
                ? `#${fromTag.name} → #${target.name}`
                : "Tanlang…"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
