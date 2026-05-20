"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Library,
  Pencil,
  Settings2,
  Trash2,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { bulkDeleteProblemsAction } from "./_actions";
import { BulkEditDialog } from "./bulk-edit-dialog";
import { BULK_OP_LIMIT } from "./_constants";
import type { FilterOption } from "./filters";
import type { ProblemListResult } from "@/lib/problems/queries";

export interface ProblemsListProps {
  rows: ProblemListResult["rows"];
  total: number;
  page: number;
  pageSize: number;
  /** Same dictionaries the filter bar gets — reused inside the bulk-edit
   *  dialog so admins pick from the identical pickers. */
  sourcesAvailable: FilterOption[];
  ageCategoriesAvailable: FilterOption[];
  topicsAvailable: FilterOption[];
}

/**
 * Block-card list of problems (replaces the previous table layout).
 *
 * Each card is a self-contained unit:
 *   - Vertical color stripe on the left, hue derived from the first topic
 *     so problems of the same topic cluster visually.
 *   - Header row: select checkbox · code · source · date · actions.
 *   - Body: 2-line markdown preview that wraps cleanly.
 *   - Footer: topic chips + age-category text.
 *
 * The whole card is clickable (link to detail). Inner buttons stop
 * propagation so checkbox/edit/delete don't trigger navigation.
 */
export function ProblemsList({
  rows,
  total,
  page,
  pageSize,
  sourcesAvailable,
  ageCategoriesAvailable,
  topicsAvailable,
}: ProblemsListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function gotoPage(n: number) {
    const next = new URLSearchParams(params.toString());
    if (n <= 1) next.delete("page");
    else next.set("page", String(n));
    startTransition(() => {
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(rows.map((r) => r.id)) : new Set());
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkDelete() {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const result = await bulkDeleteProblemsAction(Array.from(selected));
      if (result && "error" in result) {
        setDeleteError(result.error);
        return;
      }
      setSelected(new Set());
      setConfirmOpen(false);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setIsDeleting(false);
    }
  }

  const allSelectedOnPage =
    rows.length > 0 && rows.every((r) => selected.has(r.id));
  // Hard cap shared with the server schemas. The "Hammasini tanlash"
  // checkbox only selects the current page (≤ pageSize), so reaching
  // this limit takes deliberate cross-page clicking — but we still
  // gate the bulk action buttons to keep the contract honest.
  const overBulkLimit = selected.size > BULK_OP_LIMIT;

  if (rows.length === 0) {
    return (
      <div className="rounded-xl ring-1 ring-foreground/10 bg-card shadow-sm py-16 px-6 text-center space-y-2">
        <Inbox
          className="size-7 mx-auto text-muted-foreground"
          aria-hidden
          strokeWidth={1.5}
        />
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Masala topilmadi</p>
          <p className="text-xs text-muted-foreground">
            Filterlarni o&apos;zgartiring yoki yangi masala qo&apos;shing.
          </p>
        </div>
      </div>
    );
  }

  return (
    // flex-col fills the height handed down by the page. Toolbar and
    // pagination are shrink-0; the <ul> is the only flex-1/overflow-y-auto
    // element, so wheel-scroll lives inside the list, not the document.
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      {/* Top toolbar: select-all + selection bar */}
      <div className="flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0 flex-wrap">
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground select-none cursor-pointer">
            <Checkbox
              checked={allSelectedOnPage}
              onCheckedChange={(v) => toggleAll(v === true)}
              aria-label="Hammasini tanlash"
            />
            <span>
              {selected.size > 0
                ? `${selected.size} ta tanlangan`
                : "Hammasini tanlash"}
            </span>
          </label>

          {overBulkLimit && (
            <span
              role="alert"
              className="inline-flex items-center gap-1.5 rounded-md ring-1 ring-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-500"
            >
              <AlertTriangle className="size-3" aria-hidden />
              Maks {BULK_OP_LIMIT} ta. Avval kamida{" "}
              {selected.size - BULK_OP_LIMIT} ta masalani tanlovdan
              olib tashlang.
            </span>
          )}
        </div>

        {selected.size > 0 && (
          <div className="flex gap-1.5">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setSelected(new Set())}
            >
              Bekor qilish
            </Button>
            <Button
              variant="outline"
              size="xs"
              onClick={() => setBulkEditOpen(true)}
              disabled={isPending || overBulkLimit}
              title={
                overBulkLimit
                  ? `Bir vaqtda eng ko'pi bilan ${BULK_OP_LIMIT} ta masala`
                  : undefined
              }
            >
              <Settings2 data-icon="inline-start" />
              O&apos;zgartirish
            </Button>
            <Button
              variant="destructive"
              size="xs"
              onClick={() => setConfirmOpen(true)}
              disabled={isPending || overBulkLimit}
              title={
                overBulkLimit
                  ? `Bir vaqtda eng ko'pi bilan ${BULK_OP_LIMIT} ta masala`
                  : undefined
              }
            >
              <Trash2 data-icon="inline-start" />
              O&apos;chirish
            </Button>
          </div>
        )}
      </div>

      {/* Block cards — the scroll viewport. pr-1 keeps a hair of space
          between the rightmost card edge and the scrollbar. */}
      <ul className="space-y-2 flex-1 min-h-0 overflow-y-auto pr-1">
        {rows.map((r) => (
          <ProblemCard
            key={r.id}
            row={r}
            selected={selected.has(r.id)}
            onToggle={() => toggleOne(r.id)}
          />
        ))}
      </ul>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 shrink-0">
        <span className="tabular-nums">
          {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} /{" "}
          <span className="text-foreground font-medium">{total}</span> ta
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => gotoPage(page - 1)}
              disabled={page <= 1 || isPending}
              aria-label="Oldingi sahifa"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <span className="px-2 tabular-nums">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => gotoPage(page + 1)}
              disabled={page >= totalPages || isPending}
              aria-label="Keyingi sahifa"
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        )}
      </div>

      <BulkEditDialog
        open={bulkEditOpen}
        onOpenChange={setBulkEditOpen}
        problemIds={Array.from(selected)}
        sourcesAvailable={sourcesAvailable}
        ageCategoriesAvailable={ageCategoriesAvailable}
        topicsAvailable={topicsAvailable}
        onSuccess={() => {
          // Clear the selection and refresh server data so the list
          // reflects the bulk update without a full reload.
          setSelected(new Set());
          router.refresh();
        }}
      />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selected.size} ta masalani o&apos;chirasizmi?
            </DialogTitle>
            <DialogDescription>
              Bu amal qaytarib bo&apos;lmaydi. Tanlangan masalalar va ularning
              mavzu/yosh toifasi aloqalari o&apos;chiriladi.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p className="text-destructive text-sm">{deleteError}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={isDeleting}
            >
              Bekor qilish
            </Button>
            <Button
              variant="destructive"
              onClick={bulkDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "O'chirilmoqda…" : "O'chirish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------- Card -------------------------------------- */

function ProblemCard({
  row,
  selected,
  onToggle,
}: {
  row: ProblemListResult["rows"][number];
  selected: boolean;
  onToggle: () => void;
}) {
  const stripe = stripeColor(row.topicNames[0] ?? row.code);
  return (
    <li
      className={cn(
        "group relative flex rounded-xl ring-1 bg-card shadow-sm overflow-hidden transition-all",
        selected
          ? "ring-[var(--accent-brand)]/50 shadow-md"
          : "ring-foreground/10 hover:ring-foreground/25 hover:shadow-md"
      )}
    >
      {/* Color stripe */}
      <div
        className="w-1 shrink-0"
        style={{ backgroundColor: stripe }}
        aria-hidden
      />

      <div className="flex-1 min-w-0 p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              onClick={(e) => e.stopPropagation()}
              className="shrink-0"
            >
              <Checkbox
                checked={selected}
                onCheckedChange={onToggle}
                aria-label={`Tanlash ${row.code}`}
              />
            </div>
            <code className="font-mono text-[11px] tabular-nums text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5 shrink-0">
              {row.code}
            </code>
            {row.sourceName ? (
              <span className="inline-flex items-center gap-1 rounded-md ring-1 ring-foreground/10 bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-foreground/80 min-w-0">
                <Library
                  className="size-3 text-muted-foreground shrink-0"
                  aria-hidden
                />
                <span className="truncate">{row.sourceName}</span>
              </span>
            ) : (
              <span className="inline-flex items-center rounded-md ring-1 ring-dashed ring-foreground/15 bg-muted/20 px-1.5 py-0.5 text-[11px] text-muted-foreground italic">
                Manba ko&apos;rsatilmagan
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
              {formatDate(row.createdAt)}
            </span>
            <CardActions id={row.id} />
          </div>
        </div>

        {/* Body preview — clickable to open detail. `bodyPreview` is
            server-rendered HTML (KaTeX for math, escaped text otherwise),
            so it's safe to drop in via dangerouslySetInnerHTML. */}
        <Link
          href={`/admin/problems/${row.id}`}
          className="block group/body"
        >
          {row.bodyPreview ? (
            <p
              className="line-clamp-2 text-sm leading-relaxed text-foreground/90 group-hover/body:text-foreground transition-colors [&_.katex]:text-[0.95em]"
              dangerouslySetInnerHTML={{ __html: row.bodyPreview }}
            />
          ) : (
            <p className="line-clamp-2 text-sm leading-relaxed text-foreground/90 group-hover/body:text-foreground transition-colors">
              <em className="text-muted-foreground">(bo&apos;sh)</em>
            </p>
          )}
        </Link>

        {/* Footer — topics + age categories */}
        {(row.topicNames.length > 0 || row.ageCategories.length > 0) && (
          <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
            <div className="flex items-center gap-1 flex-wrap">
              {row.topicNames.slice(0, 4).map((t, i) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
                >
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: stripeColor(t) }}
                    aria-hidden
                  />
                  {t}
                  {i < Math.min(row.topicNames.length, 4) - 1 && (
                    <span className="text-muted-foreground/40 ml-1">·</span>
                  )}
                </span>
              ))}
              {row.topicNames.length > 4 && (
                <span className="text-[11px] text-muted-foreground/70">
                  +{row.topicNames.length - 4}
                </span>
              )}
            </div>
            {row.ageCategories.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                {row.ageCategories.map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center rounded-md ring-1 ring-foreground/10 bg-muted/40 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground"
                  >
                    {c.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function CardActions({ id }: { id: string }) {
  return (
    <div className="flex items-center gap-0.5 opacity-40 group-hover:opacity-100 transition-opacity">
      <Button
        variant="ghost"
        size="icon-xs"
        nativeButton={false}
        render={<Link href={`/admin/problems/${id}/edit`} />}
        aria-label="Tahrirlash"
      >
        <Pencil className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        nativeButton={false}
        render={<Link href={`/admin/problems/${id}`} />}
        aria-label="Ochish"
      >
        <ArrowUpRight className="size-3.5" />
      </Button>
    </div>
  );
}

/* -------------------------- Color helper ------------------------------- */

/**
 * Stable hue per string. Used for the left-edge stripe and topic dots.
 * Returns a soft saturated OKLCH so the stripe pops without overpowering
 * the card content.
 */
function stripeColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const hue = h % 360;
  return `oklch(0.72 0.14 ${hue})`;
}
