import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import {
  getAgeCategoryById,
  getTopicsInAgeCategory,
} from "@/lib/taxonomy/queries";
import { TopicSearchInput } from "@/app/admin/topics/[id]/topic-search-input";
import { ClassFilter } from "@/app/admin/topics/[id]/class-filter";
import { listProblems } from "@/lib/problems/queries";
import { parseSearchParams } from "@/app/admin/problems/_url-state";
import { ProblemsTable } from "@/app/admin/problems/problems-table";
import { TopicsInAgeList } from "./topics-in-age-list";

export default async function AgeCategoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const { id } = await params;

  // Pass `null` as parentTopicId — we want root-level topics first. Drilling
  // deeper happens via /admin/topics/[id]?ageCategory=... which already
  // accepts the URL param.
  const [ageCategory, rootTopics] = await Promise.all([
    getAgeCategoryById(id),
    getTopicsInAgeCategory(id, null),
  ]);
  if (!ageCategory) notFound();

  // The leaf-mode problems table appears only when there are NO top-level
  // topics for this age category — i.e. no drill-in path. In that case we
  // still let admins filter problems directly.
  const sp = await searchParams;
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
  const scopedFilters = { ...filters, ageCategoryIds: [id] };

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-xs text-muted-foreground"
      >
        <Link
          href="/admin/age-categories"
          className="hover:text-foreground transition-colors"
        >
          Yosh toifalari
        </Link>
        <ChevronRight className="size-3" aria-hidden />
        <span className="text-foreground/80 font-medium">
          {ageCategory.name}
        </span>
      </nav>

      <header className="space-y-1.5">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold tracking-tight">
            {ageCategory.name}
          </h1>
          <span className="text-xs text-muted-foreground font-mono">
            {ageCategory.slug}
          </span>
        </div>
        {ageCategory.description && (
          <p className="text-sm text-muted-foreground max-w-prose">
            {ageCategory.description}
          </p>
        )}
      </header>

      {rootTopics.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <TopicSearchInput placeholder="Mavzu qidirish…" />
            <ClassFilter />
          </div>
          <TopicsInAgeList ageCategoryId={id} topics={rootTopics} />
        </div>
      ) : (
        <ProblemsFallback
          filters={scopedFilters}
          sort={sort}
          page={page}
          pageSize={pageSize}
        />
      )}
    </div>
  );
}

async function ProblemsFallback({
  filters,
  sort,
  page,
  pageSize,
}: {
  filters: Parameters<typeof listProblems>[0];
  sort: Parameters<typeof listProblems>[1];
  page: number;
  pageSize: number;
}) {
  const { rows, total } = await listProblems(filters, sort, page, pageSize);
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
