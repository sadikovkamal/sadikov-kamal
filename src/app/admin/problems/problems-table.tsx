"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Trash2,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { bulkDeleteProblemsAction } from "./_actions";
import type {
  ProblemListResult,
  ProblemListSort,
} from "@/lib/problems/queries";

export interface ProblemsTableProps {
  rows: ProblemListResult["rows"];
  total: number;
  page: number;
  pageSize: number;
  sort: ProblemListSort;
}

export function ProblemsTable({
  rows,
  total,
  page,
  pageSize,
  sort,
}: ProblemsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function pushParams(next: URLSearchParams) {
    startTransition(() => {
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  function gotoPage(n: number) {
    const next = new URLSearchParams(params.toString());
    if (n <= 1) next.delete("page");
    else next.set("page", String(n));
    pushParams(next);
  }

  function changeSort(field: ProblemListSort["field"]) {
    const next = new URLSearchParams(params.toString());
    next.set("sortField", field);
    next.set(
      "sortDir",
      sort.field === field && sort.direction === "desc" ? "asc" : "desc"
    );
    next.delete("page");
    pushParams(next);
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
            Yangi masala qo&apos;shing yoki qidiruv shartlarini o&apos;zgartiring.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Selection bar — appears only when items selected. */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-[var(--accent-brand-soft)] px-3 py-2 text-xs">
          <span className="font-medium">
            <span className="tabular-nums">{selected.size}</span> ta tanlangan
          </span>
          <div className="flex gap-1.5">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setSelected(new Set())}
            >
              Bekor qilish
            </Button>
            <Button
              variant="destructive"
              size="xs"
              onClick={() => setConfirmOpen(true)}
              disabled={isPending}
            >
              <Trash2 data-icon="inline-start" />
              O&apos;chirish
            </Button>
          </div>
        </div>
      )}

      {/* Real data table — sticky header, dense rows, hover highlight. */}
      <div className="rounded-xl ring-1 ring-foreground/10 bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr className="border-b">
                <Th className="w-8 pl-3">
                  <Checkbox
                    checked={allSelectedOnPage}
                    onCheckedChange={(v) => toggleAll(v === true)}
                    aria-label="Hammasini tanlash"
                  />
                </Th>
                <Th>Masala</Th>
                <ThSortable
                  active={sort.field === "year"}
                  direction={sort.direction}
                  onClick={() => changeSort("year")}
                >
                  Manba · Yil
                </ThSortable>
                <Th>Mavzular</Th>
                <Th>Sinf</Th>
                <ThSortable
                  active={sort.field === "createdAt"}
                  direction={sort.direction}
                  onClick={() => changeSort("createdAt")}
                  className="pr-3"
                >
                  Sana
                </ThSortable>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => {
                const sourceLine = [
                  r.sourceName,
                  r.year ? String(r.year) : null,
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <tr
                    key={r.id}
                    className="group hover:bg-muted/40 transition-colors"
                  >
                    <Td className="w-8 pl-3 align-top pt-3">
                      <Checkbox
                        checked={selected.has(r.id)}
                        onCheckedChange={() => toggleOne(r.id)}
                        aria-label={`Select ${r.id}`}
                      />
                    </Td>
                    <Td className="max-w-md">
                      <Link
                        href={`/admin/problems/${r.id}`}
                        className="block py-2.5"
                      >
                        <p className="line-clamp-2 leading-snug text-foreground/90 group-hover:text-foreground">
                          {r.bodyPreview || (
                            <em className="text-muted-foreground">
                              (bo&apos;sh)
                            </em>
                          )}
                        </p>
                      </Link>
                    </Td>
                    <Td className="align-middle py-2.5 whitespace-nowrap">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[13px] font-medium">
                          {sourceLine || "—"}
                        </span>
                        {r.problemNumber && (
                          <span className="text-[11px] font-mono text-muted-foreground">
                            #{r.problemNumber}
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td className="align-middle py-2.5">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {r.topicNames.slice(0, 2).map((t) => (
                          <Badge
                            key={t}
                            variant="secondary"
                            className="text-[10px] font-normal py-0 px-1.5"
                          >
                            {t}
                          </Badge>
                        ))}
                        {r.topicNames.length > 2 && (
                          <span className="text-[10px] text-muted-foreground self-center">
                            +{r.topicNames.length - 2}
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td className="align-middle py-2.5 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                      {r.classes.length ? r.classes.join(", ") : "—"}
                    </Td>
                    <Td className="align-middle py-2.5 pr-3 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                      {formatDate(r.createdAt)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="tabular-nums">
          {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of{" "}
          <span className="text-foreground font-medium">{total}</span>
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

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selected.size} ta masalani o&apos;chirasizmi?
            </DialogTitle>
            <DialogDescription>
              Bu amal qaytarib bo&apos;lmaydi. Tanlangan masalalar va ularning
              mavzu/sinf aloqalari o&apos;chiriladi.
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

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "text-left font-medium px-3 py-2 whitespace-nowrap",
        className
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={cn("px-3", className)}>{children}</td>;
}

function ThSortable({
  children,
  active,
  direction,
  onClick,
  className,
}: {
  children: React.ReactNode;
  active: boolean;
  direction: ProblemListSort["direction"];
  onClick: () => void;
  className?: string;
}) {
  const Icon =
    !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      className={cn(
        "text-left font-medium px-3 py-2 whitespace-nowrap",
        className
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground transition-colors",
          active && "text-foreground"
        )}
      >
        {children}
        <Icon className="size-3" aria-hidden />
      </button>
    </th>
  );
}
