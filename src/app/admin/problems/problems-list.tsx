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
import { useSelection } from "./_selection-context";
import { BULK_OP_LIMIT } from "./_constants";
import { PAGE_SIZE_OPTIONS } from "./_url-state";
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
  methodsAvailable: FilterOption[];
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
  methodsAvailable,
}: ProblemsListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  // Selection lives in a layout-scoped React context (backed by
  // localStorage) so it survives filter URL changes, route navigation
  // away to a detail page, and full page reloads. See
  // `_selection-context.tsx` + `layout.tsx`.
  const { selected, selectMany, deselectMany, toggle, clear } = useSelection();
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

  function changePageSize(size: number) {
    const next = new URLSearchParams(params.toString());
    if (size === 25) next.delete("pageSize");
    else next.set("pageSize", String(size));
    // Recompute the page so the user keeps roughly the same item in view
    // after the size change — otherwise jumping from 25 → 200 on page 10
    // would land them past the end of the result set.
    const firstItemIndex = (page - 1) * pageSize;
    const newPage = Math.max(1, Math.floor(firstItemIndex / size) + 1);
    if (newPage <= 1) next.delete("page");
    else next.set("page", String(newPage));
    startTransition(() => {
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  // The select-all checkbox toggles the current page only. With cross-page
  // selection now persisted in context, "all" means "every row visible
  // right now" — un-checking deselects only those visible rows, leaving
  // previously selected rows on other pages untouched.
  function toggleAll(checked: boolean) {
    const pageIds = rows.map((r) => r.id);
    if (checked) selectMany(pageIds);
    else deselectMany(pageIds);
  }
  function toggleOne(id: string) {
    toggle(id);
  }

  async function bulkDelete() {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const result = await bulkDeleteProblemsAction(Array.from(selected));
      if ("error" in result) {
        setDeleteError(result.error);
        return;
      }
      // Drop just the deleted IDs from the selection — anything ticked
      // on other pages that wasn't part of this delete stays selected.
      deselectMany(result.deletedIds);
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
              onClick={() => clear()}
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
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground pt-1 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="tabular-nums">
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} /{" "}
            <span className="text-foreground font-medium">{total}</span> ta
          </span>
          <PageSizeSelector
            value={pageSize}
            onChange={changePageSize}
            disabled={isPending}
          />
        </div>
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
            <PageInput
              page={page}
              totalPages={totalPages}
              disabled={isPending}
              onGo={gotoPage}
            />
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
        sourcesAvailable={sourcesAvailable}
        ageCategoriesAvailable={ageCategoriesAvailable}
        topicsAvailable={topicsAvailable}
        methodsAvailable={methodsAvailable}
        onSuccess={() => {
          // Refresh server data so the list reflects the bulk update
          // without a full reload. The dialog clears its own selection
          // via the context (see bulk-edit-dialog.tsx).
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
  const stripe = stripeColor(row.topics[0]?.name ?? row.code);
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

      <div className="flex-1 min-w-0 p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
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
            {row.sourceCode ? (
              <Link
                href={`/admin/problems?source=${row.sourceCode}`}
                className="inline-flex items-center gap-1 rounded-md ring-1 ring-foreground/10 bg-muted/40 hover:bg-muted hover:ring-foreground/25 px-1.5 py-0.5 text-[11px] font-medium text-foreground/80 min-w-0 transition-colors"
                title={`Faqat ${row.sourceName} manbasi`}
              >
                <Library
                  className="size-3 text-muted-foreground shrink-0"
                  aria-hidden
                />
                <span className="truncate">{row.sourceName}</span>
              </Link>
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
            <CardActions code={row.code} />
          </div>
        </div>

        {/* Body preview — its own sub-panel so the problem statement
            reads as a discrete "card-within-a-card". Clickable to open
            the detail page. `bodyPreview` is server-rendered HTML
            (KaTeX for math, escaped text otherwise) — safe to drop in
            via dangerouslySetInnerHTML. Detail URL uses the human
            P####### code, not the UUID. */}
        <Link
          href={`/admin/problems/${row.code}`}
          className="block group/body rounded-lg ring-1 ring-foreground/5 bg-muted/40 hover:bg-muted/60 hover:ring-foreground/10 px-3.5 py-2.5 transition-colors"
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

        {/* Footer — every topic + age category is a chip-shaped link
            that drills into the matching filter. Topics use a colour
            dot derived from the topic name (same hue family as the
            left stripe); age categories stay neutral. */}
        {(row.topics.length > 0 || row.ageCategories.length > 0) && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1 flex-wrap">
              {row.topics.map((t) => (
                <Link
                  key={t.id}
                  href={`/admin/problems?topic=${t.code}`}
                  title={`Faqat ${t.name} mavzusi`}
                  className="inline-flex items-center gap-1 rounded-md ring-1 ring-foreground/10 bg-muted/30 hover:bg-muted hover:ring-foreground/25 px-1.5 py-0.5 text-[11px] text-foreground/80 transition-colors"
                >
                  <span
                    className="size-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: stripeColor(t.name) }}
                    aria-hidden
                  />
                  <span className="truncate">{t.name}</span>
                </Link>
              ))}
            </div>
            {row.ageCategories.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                {row.ageCategories.map((c) => (
                  <Link
                    key={c.id}
                    href={`/admin/problems?ageCategory=${c.code}`}
                    title={`Faqat ${c.name}`}
                    className="inline-flex items-center rounded-md ring-1 ring-foreground/10 bg-muted/40 hover:bg-muted hover:ring-foreground/25 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {c.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function CardActions({ code }: { code: string }) {
  return (
    <div className="flex items-center gap-0.5 opacity-40 group-hover:opacity-100 transition-opacity">
      <Button
        variant="ghost"
        size="icon-xs"
        nativeButton={false}
        render={<Link href={`/admin/problems/${code}/edit`} />}
        aria-label="Tahrirlash"
      >
        <Pencil className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        nativeButton={false}
        render={<Link href={`/admin/problems/${code}`} />}
        aria-label="Ochish"
      >
        <ArrowUpRight className="size-3.5" />
      </Button>
    </div>
  );
}

/* -------------------------- Page size selector ------------------------ */

/**
 * Native-<select> sized to match the prev/next buttons. Picked over a
 * shadcn Select because the choices are short, fixed, and don't need
 * search/icons/typeahead — the native control is one element, fully
 * keyboard accessible, and respects platform conventions.
 */
function PageSizeSelector({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (size: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 tabular-nums">
      <span>Sahifada:</span>
      <select
        value={value}
        onChange={(e) => onChange(Number.parseInt(e.target.value, 10))}
        disabled={disabled}
        aria-label="Sahifada ko'rinadigan masalalar soni"
        className={cn(
          "h-7 rounded-md ring-1 ring-foreground/15 bg-card",
          "px-1.5 text-xs text-foreground tabular-nums cursor-pointer",
          "focus:outline-none focus:ring-2 focus:ring-[var(--accent-brand)]",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        {PAGE_SIZE_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}

/* -------------------------- Page input -------------------------------- */

/**
 * Editable "N / total" indicator. Typing into the input updates local
 * state without navigating; Enter (or blur) commits — values are clamped
 * to [1, totalPages]. When the URL-driven `page` prop changes elsewhere
 * (prev/next clicks, filter changes), the local input snaps back to it.
 */
function PageInput({
  page,
  totalPages,
  disabled,
  onGo,
}: {
  page: number;
  totalPages: number;
  disabled?: boolean;
  onGo: (n: number) => void;
}) {
  const [raw, setRaw] = useState(String(page));
  // Sync local input whenever the source of truth (URL → prop) changes.
  // Adjusting state during render (instead of useEffect + setState) is
  // React's recommended pattern for "reset internal state when a prop
  // changes" — it avoids the cascading-render cost of an effect and
  // lets the input stay focused across page changes (a key={page}
  // approach would remount and steal focus).
  // See: https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevPage, setPrevPage] = useState(page);
  if (page !== prevPage) {
    setPrevPage(page);
    setRaw(String(page));
  }

  function commit() {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) {
      setRaw(String(page));
      return;
    }
    const clamped = Math.min(totalPages, Math.max(1, n));
    if (clamped !== page) {
      onGo(clamped);
    } else {
      // Clean up any leading-zeros or stray chars the user typed.
      setRaw(String(clamped));
    }
  }

  // Width grows with the digit count so 3-digit totals still fit
  // without truncating, but 1- or 2-digit pages stay compact.
  const width = Math.max(2, String(totalPages).length) + 1; // +1 for caret breathing room

  return (
    <div className="flex items-center gap-1 px-1 tabular-nums">
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={raw}
        onChange={(e) => setRaw(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setRaw(String(page));
            (e.target as HTMLInputElement).blur();
          }
        }}
        disabled={disabled}
        aria-label={`Sahifa raqami (1 dan ${totalPages} gacha)`}
        className={cn(
          "h-7 rounded-md ring-1 ring-foreground/15 bg-card text-center",
          "text-xs text-foreground tabular-nums",
          "focus:outline-none focus:ring-2 focus:ring-[var(--accent-brand)]",
          "disabled:opacity-50"
        )}
        style={{ width: `${width}ch`, minWidth: "2.25rem" }}
      />
      <span>/ {totalPages}</span>
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
