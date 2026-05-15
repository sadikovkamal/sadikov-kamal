"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronRight, FolderTree } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
  TopicWithCount,
  TopicInAgeCategory,
} from "@/lib/taxonomy/queries";

type Item = TopicWithCount | TopicInAgeCategory;

function getCount(item: Item, scoped: boolean): number {
  if (scoped && "scopedProblemCount" in item) {
    return item.scopedProblemCount;
  }
  return item.problemCount;
}

/**
 * Child-topics list used on the topic detail page. The `hrefSuffix` is the
 * `?source=…` or `?ageCategory=…` carried over from the URL so drilling deeper
 * preserves whatever scope brought the user here. Empty string when unscoped.
 */
export function ChildrenList({
  items,
  hrefSuffix = "",
}: {
  items: Item[];
  hrefSuffix?: string;
}) {
  const params = useSearchParams();
  const q = (params.get("q") ?? "").trim().toLowerCase();
  const scoped = hrefSuffix.length > 0;

  const filtered = useMemo(() => {
    if (!q) return items;
    return items.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q)
    );
  }, [items, q]);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border bg-card py-16 px-6 text-center space-y-2">
        <FolderTree
          className="size-7 mx-auto text-muted-foreground"
          aria-hidden
          strokeWidth={1.5}
        />
        <p className="text-sm font-medium">Bola mavzular yo&apos;q</p>
        <p className="text-xs text-muted-foreground">
          Mavzular ro&apos;yxatidan yangi bola mavzu qo&apos;shing.
        </p>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="rounded-lg border bg-card py-12 px-6 text-center">
        <p className="text-sm text-muted-foreground">
          &quot;{q}&quot; bo&apos;yicha bola mavzu topilmadi.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden divide-y">
      {filtered.map((c) => (
        <Link
          key={c.id}
          href={`/admin/topics/${c.id}${hrefSuffix}`}
          className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
        >
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <span className="font-medium truncate group-hover:text-[var(--accent-brand-strong)] transition-colors">
              {c.name}
            </span>
            <span className="text-xs text-muted-foreground font-mono truncate">
              {c.slug}
            </span>
          </div>
          <Badge variant="outline" className="shrink-0 tabular-nums">
            {getCount(c, scoped)} ta masala
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
