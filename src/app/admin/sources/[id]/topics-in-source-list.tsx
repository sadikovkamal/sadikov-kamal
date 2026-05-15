"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronRight, FolderTree } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { TopicInAgeCategory } from "@/lib/taxonomy/queries";

/**
 * Topic list scoped to a source. Clicking a topic navigates to the topic
 * detail page with `?source=<id>` preserved, so the topic page filters its
 * children / problems to that source context.
 */
export function TopicsInSourceList({
  sourceId,
  topics,
}: {
  sourceId: string;
  topics: TopicInAgeCategory[];
}) {
  const params = useSearchParams();
  const q = (params.get("q") ?? "").trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return topics;
    return topics.filter(
      (t) =>
        t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q)
    );
  }, [topics, q]);

  if (topics.length === 0) {
    return (
      <div className="rounded-lg border bg-card py-16 px-6 text-center space-y-2">
        <FolderTree
          className="size-7 mx-auto text-muted-foreground"
          aria-hidden
          strokeWidth={1.5}
        />
        <p className="text-sm font-medium">Mavzular yo&apos;q</p>
        <p className="text-xs text-muted-foreground">
          Hozircha bu manbaga taglangan masalalar mavjud emas.
        </p>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="rounded-lg border bg-card py-12 px-6 text-center">
        <p className="text-sm text-muted-foreground">
          &quot;{q}&quot; bo&apos;yicha mavzu topilmadi.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden divide-y">
      {filtered.map((t) => (
        <Link
          key={t.id}
          href={`/admin/topics/${t.id}?source=${sourceId}`}
          className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
        >
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <span className="font-medium truncate group-hover:text-[var(--accent-brand-strong)] transition-colors">
              {t.name}
            </span>
            <span className="text-xs text-muted-foreground font-mono truncate">
              {t.slug}
            </span>
          </div>
          <Badge variant="outline" className="shrink-0 tabular-nums">
            {t.scopedProblemCount} ta masala
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
