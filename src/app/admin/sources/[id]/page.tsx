import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import {
  getSourceById,
  getSourceChildren,
  getSourceAncestors,
  getTopicsInSource,
} from "@/lib/taxonomy/queries";
import { listProblems } from "@/lib/problems/queries";
import { parseSearchParams } from "@/app/admin/problems/_url-state";
import { ProblemsTable } from "@/app/admin/problems/problems-table";
import { TopicSearchInput } from "@/app/admin/topics/[id]/topic-search-input";
import { ClassFilter } from "@/app/admin/topics/[id]/class-filter";
import { SourceChildrenList } from "./children-list";
import { TopicsInSourceList } from "./topics-in-source-list";

export default async function SourceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const { id } = await params;

  const [source, children, ancestors] = await Promise.all([
    getSourceById(id),
    getSourceChildren(id),
    getSourceAncestors(id),
  ]);
  if (!source) notFound();

  const isParent = children.length > 0;

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap"
      >
        <Link
          href="/admin/sources"
          className="hover:text-foreground transition-colors"
        >
          Manbalar
        </Link>
        {ancestors.map((a) => (
          <span key={a.id} className="inline-flex items-center gap-1">
            <ChevronRight className="size-3" aria-hidden />
            <Link
              href={`/admin/sources/${a.id}`}
              className="hover:text-foreground transition-colors"
            >
              {a.name}
            </Link>
          </span>
        ))}
        <ChevronRight className="size-3" aria-hidden />
        <span className="text-foreground/80 font-medium">{source.name}</span>
      </nav>

      {/* Header */}
      <header className="space-y-1.5">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold tracking-tight">{source.name}</h1>
          <span className="text-xs text-muted-foreground font-mono">
            {source.slug}
          </span>
          {source.country && (
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-2 py-0.5 rounded-md bg-muted">
              {source.country}
            </span>
          )}
        </div>
      </header>

      {isParent ? (
        <ParentMode items={children} />
      ) : (
        <LeafMode sourceId={source.id} searchParams={searchParams} />
      )}
    </div>
  );
}

function ParentMode({
  items,
}: {
  items: Awaited<ReturnType<typeof getSourceChildren>>;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <TopicSearchInput placeholder="Ichki manba qidirish…" />
      </div>
      <SourceChildrenList items={items} />
    </div>
  );
}

async function LeafMode({
  sourceId,
  searchParams,
}: {
  sourceId: string;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const topicsInSource = await getTopicsInSource(sourceId, null);

  // If at least one topic has problems for this source, show topics
  // (clicking a topic drills into /admin/topics/[id]?source=...).
  // Otherwise fall back to a direct problems table — keeps the page useful
  // even before any tagging exists.
  if (topicsInSource.length > 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <TopicSearchInput placeholder="Mavzu qidirish…" />
          <ClassFilter />
        </div>
        <TopicsInSourceList sourceId={sourceId} topics={topicsInSource} />
      </div>
    );
  }

  // Fallback: no topics tagged yet — render problems list directly.
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      v.forEach((x) => {
        const existing = usp.get(k);
        usp.set(k, existing ? `${existing},${x}` : x);
      });
    } else {
      usp.set(k, v);
    }
  }
  const { filters, sort, page, pageSize } = parseSearchParams(usp);
  const scopedFilters = { ...filters, sourceIds: [sourceId] };
  const { rows, total } = await listProblems(scopedFilters, sort, page, pageSize);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <TopicSearchInput placeholder="Masala qidirish…" />
          <ClassFilter />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          Jami {total.toLocaleString("en-US").replace(/,/g, " ")} ta
        </span>
      </div>
      <ProblemsTable
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        sort={sort}
      />
    </div>
  );
}
