"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
    // Same field → toggle direction; different field → start desc.
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
      // Server action revalidated the path; the new RSC payload arrives
      // automatically. Just clear local UI state.
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between min-h-8">
        <div className="text-sm text-muted-foreground">
          {selected.size > 0
            ? `${selected.size} ta tanlangan`
            : `${total} ta masala`}
        </div>
        {selected.size > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={isPending}
          >
            Tanlanganlarni o&apos;chirish
          </Button>
        )}
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelectedOnPage}
                  onCheckedChange={(v) => toggleAll(v === true)}
                  aria-label="Select all on page"
                />
              </TableHead>
              <TableHead>Masala</TableHead>
              <TableHead className="cursor-pointer" onClick={() => changeSort("year")}>
                <SortLabel
                  active={sort.field === "year"}
                  direction={sort.direction}
                >
                  Manba / Yil
                </SortLabel>
              </TableHead>
              <TableHead
                className="cursor-pointer"
                onClick={() => changeSort("difficulty")}
              >
                <SortLabel
                  active={sort.field === "difficulty"}
                  direction={sort.direction}
                >
                  Qiyinlik
                </SortLabel>
              </TableHead>
              <TableHead>Mavzular</TableHead>
              <TableHead>Sinflar</TableHead>
              <TableHead
                className="cursor-pointer"
                onClick={() => changeSort("createdAt")}
              >
                <SortLabel
                  active={sort.field === "createdAt"}
                  direction={sort.direction}
                >
                  Yaratilgan
                </SortLabel>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-12 text-muted-foreground"
                >
                  Hozirgi filtrlar bilan masala topilmadi.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(r.id)}
                    onCheckedChange={() => toggleOne(r.id)}
                    aria-label={`Select ${r.id}`}
                  />
                </TableCell>
                <TableCell className="max-w-md">
                  <Link
                    href={`/admin/problems/${r.id}`}
                    className="hover:underline line-clamp-2"
                  >
                    {r.bodyPreview || <em className="text-muted-foreground">(bo&apos;sh)</em>}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  {r.sourceName}
                  {r.year ? ` ${r.year}` : ""}
                  {r.problemNumber && (
                    <span className="text-muted-foreground"> #{r.problemNumber}</span>
                  )}
                </TableCell>
                <TableCell>{r.difficulty}/5</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {r.topicNames.slice(0, 2).map((t) => (
                      <Badge key={t} variant="secondary" className="text-xs">
                        {t}
                      </Badge>
                    ))}
                    {r.topicNames.length > 2 && (
                      <span className="text-xs text-muted-foreground">
                        +{r.topicNames.length - 2}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap">
                  {r.classes.join(", ")}
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap">
                  {new Date(r.createdAt).toLocaleDateString("uz-UZ")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {totalPages > 1 ? `${page} / ${totalPages}` : ""}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => gotoPage(page - 1)}
            disabled={page <= 1 || isPending}
          >
            Oldingi
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => gotoPage(page + 1)}
            disabled={page >= totalPages || isPending}
          >
            Keyingi
          </Button>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected.size} ta masalani o&apos;chirasizmi?</DialogTitle>
            <DialogDescription>
              Bu amal qaytarib bo&apos;lmaydi. Tanlangan masalalar va ularning
              mavzu/teg/sinf aloqalari o&apos;chiriladi.
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

function SortLabel({
  children,
  active,
  direction,
}: {
  children: React.ReactNode;
  active: boolean;
  direction: ProblemListSort["direction"];
}) {
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center gap-1", active && "font-medium")}>
      {children}
      <Icon className="size-3" />
    </span>
  );
}
