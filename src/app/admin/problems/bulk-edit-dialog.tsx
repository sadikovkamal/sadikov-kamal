"use client";

import { useState, useTransition } from "react";
import { Hash, Library, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FilterPopover, type FilterOption } from "./filters";
import { bulkUpdateProblemsAction } from "./_actions";

/**
 * Bulk edit modal — applies one or more shared field updates across the
 * currently selected problems.
 *
 * Each field starts empty; only fields with at least one pick are sent
 * to the server. Source is single-select (a problem has exactly one
 * source); the FilterPopover's toggle semantics are wrapped so clicking
 * a new option replaces the current pick. Age categories and topics are
 * multi-select; the server replaces the existing junction rows on every
 * selected problem with the picked set (see bulkUpdateProblemsTx).
 *
 * The "O'zgartirish" button stays disabled until at least one field is
 * touched and there is no in-flight request.
 */
export function BulkEditDialog({
  open,
  onOpenChange,
  problemIds,
  sourcesAvailable,
  ageCategoriesAvailable,
  topicsAvailable,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  problemIds: string[];
  sourcesAvailable: FilterOption[];
  ageCategoriesAvailable: FilterOption[];
  topicsAvailable: FilterOption[];
  onSuccess: () => void;
}) {
  const [sourceId, setSourceId] = useState<string | undefined>(undefined);
  const [ageCategoryIds, setAgeCategoryIds] = useState<string[]>([]);
  const [topicIds, setTopicIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setSourceId(undefined);
    setAgeCategoryIds([]);
    setTopicIds([]);
    setError(null);
  }

  function close() {
    if (isPending) return;
    reset();
    onOpenChange(false);
  }

  // Wrap FilterPopover's toggle into single-select for the source field.
  // FilterPopover returns the new selection array after a click; for our
  // purposes "the newest pick" replaces the current one, and clicking
  // the already-selected source clears it.
  function handleSourceChange(newIds: string[]) {
    const prev = sourceId ? [sourceId] : [];
    const added = newIds.find((id) => !prev.includes(id));
    setSourceId(added ?? undefined);
  }

  const hasAnyChange =
    sourceId !== undefined ||
    ageCategoryIds.length > 0 ||
    topicIds.length > 0;

  function onSubmit() {
    if (!hasAnyChange) return;
    setError(null);
    const payload: {
      ids: string[];
      sourceId?: string;
      ageCategoryIds?: string[];
      topicIds?: string[];
    } = { ids: problemIds };
    if (sourceId) payload.sourceId = sourceId;
    if (ageCategoryIds.length > 0) payload.ageCategoryIds = ageCategoryIds;
    if (topicIds.length > 0) payload.topicIds = topicIds;

    startTransition(async () => {
      const res = await bulkUpdateProblemsAction(payload);
      if (res && "error" in res) {
        setError(res.error);
        return;
      }
      reset();
      onOpenChange(false);
      onSuccess();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
        else onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {problemIds.length} ta masalani o&apos;zgartirish
          </DialogTitle>
          <DialogDescription>
            Faqat to&apos;ldirilgan maydonlar yangilanadi. Bo&apos;sh
            qoldirilgan maydonlar tegmaydi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field
            label="Manba"
            hint="Tanlangan barcha masalalar uchun manba almashtiriladi."
          >
            <FilterPopover
              label="Tanlang"
              icon={<Library className="size-3.5" aria-hidden />}
              count={sourceId ? 1 : 0}
              options={sourcesAvailable}
              selected={sourceId ? [sourceId] : []}
              onChange={handleSourceChange}
            />
          </Field>

          <Field
            label="Yosh toifasi"
            hint="Mavjud yosh toifalari ushbu ro'yxat bilan almashtiriladi."
          >
            <FilterPopover
              label="Tanlang"
              icon={<Hash className="size-3.5" aria-hidden />}
              count={ageCategoryIds.length}
              options={ageCategoriesAvailable}
              selected={ageCategoryIds}
              onChange={setAgeCategoryIds}
            />
          </Field>

          <Field
            label="Mavzular"
            hint="Mavjud mavzular ushbu ro'yxat bilan almashtiriladi."
          >
            <FilterPopover
              label="Tanlang"
              icon={<Tags className="size-3.5" aria-hidden />}
              count={topicIds.length}
              options={topicsAvailable}
              selected={topicIds}
              onChange={setTopicIds}
            />
          </Field>
        </div>

        {error && (
          <p className="text-xs text-destructive leading-relaxed">{error}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={isPending}>
            Bekor qilish
          </Button>
          <Button onClick={onSubmit} disabled={!hasAnyChange || isPending}>
            {isPending ? "Saqlanmoqda…" : "O'zgartirish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-[11px] text-muted-foreground italic">
          ixtiyoriy
        </span>
      </div>
      {children}
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        {hint}
      </p>
    </div>
  );
}
