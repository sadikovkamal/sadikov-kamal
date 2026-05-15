"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronRight, Library } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SourceWithCount } from "@/lib/taxonomy/queries";
import type { SourceKind } from "@/lib/taxonomy/mutations";

const KIND_LABELS: Record<SourceKind, string> = {
  olympiad: "Olimpiada",
  book: "Kitob",
  course: "Kurs",
  other: "Boshqa",
};

/** Sub-source list rendered in parent-mode of the source detail page. */
export function SourceChildrenList({ items }: { items: SourceWithCount[] }) {
  const params = useSearchParams();
  const q = (params.get("q") ?? "").trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return items;
    return items.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q)
    );
  }, [items, q]);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border bg-card py-16 px-6 text-center space-y-2">
        <Library
          className="size-7 mx-auto text-muted-foreground"
          aria-hidden
          strokeWidth={1.5}
        />
        <p className="text-sm font-medium">Ichki manbalar yo&apos;q</p>
        <p className="text-xs text-muted-foreground">
          Manbalar ro&apos;yxatidan yangi bola manba qo&apos;shing.
        </p>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="rounded-lg border bg-card py-12 px-6 text-center">
        <p className="text-sm text-muted-foreground">
          &quot;{q}&quot; bo&apos;yicha manba topilmadi.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden divide-y">
      {filtered.map((s) => (
        <Link
          key={s.id}
          href={`/admin/sources/${s.id}`}
          className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
        >
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <span className="font-medium truncate group-hover:text-[var(--accent-brand-strong)] transition-colors">
              {s.name}
            </span>
            <span className="text-xs text-muted-foreground font-mono truncate">
              {s.slug}
            </span>
            <Badge variant="secondary" className="shrink-0">
              {KIND_LABELS[s.kind]}
            </Badge>
          </div>
          <Badge variant="outline" className="shrink-0 tabular-nums">
            {s.problemCount} ta masala
          </Badge>
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        </Link>
      ))}
    </div>
  );
}
