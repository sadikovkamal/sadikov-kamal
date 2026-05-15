import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import {
  getTopicById,
  getTopicChildren,
  getTopicAncestors,
  getTopicsInAgeCategory,
  getTopicsInSource,
  getAgeCategoryById,
  getSourceById,
  type TopicWithCount,
  type TopicInAgeCategory,
} from "@/lib/taxonomy/queries";
import { listProblems } from "@/lib/problems/queries";
import { parseSearchParams } from "@/app/admin/problems/_url-state";
import { ProblemsTable } from "@/app/admin/problems/problems-table";
import { ChildrenList } from "./children-list";
import { ClassFilter } from "./class-filter";
import { TopicSearchInput } from "./topic-search-input";

/**
 * The topic detail page supports two optional scope params via URL:
 *   - `ageCategory=<uuid>` — scopes children/problems to an age category
 *   - `source=<uuid>` — scopes children/problems to a source
 *
 * The two scopes are mutually exclusive in current UX flows (you arrive via
 * one or the other), but the page handles them symmetrically. If both are
 * provided we prefer `source` since it's the more recently introduced flow.
 */
export default async function TopicDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;

  const sourceId = typeof sp.source === "string" ? sp.source : undefined;
  const ageCategoryId =
    !sourceId && typeof sp.ageCategory === "string"
      ? sp.ageCategory
      : undefined;

  const [topic, ancestors, scope] = await Promise.all([
    getTopicById(id),
    getTopicAncestors(id),
    resolveScope({ sourceId, ageCategoryId }),
  ]);
  if (!topic) notFound();

  let scopedChildren: TopicInAgeCategory[] = [];
  let unscopedChildren: TopicWithCount[] = [];
  let isParent = false;

  if (scope.kind === "source") {
    scopedChildren = await getTopicsInSource(scope.source.id, id);
    isParent = scopedChildren.length > 0;
  } else if (scope.kind === "ageCategory") {
    scopedChildren = await getTopicsInAgeCategory(scope.ageCategory.id, id);
    isParent = scopedChildren.length > 0;
  } else {
    unscopedChildren = await getTopicChildren(id);
    isParent = unscopedChildren.length > 0;
  }

  const scopeHrefSuffix =
    scope.kind === "source"
      ? `?source=${scope.source.id}`
      : scope.kind === "ageCategory"
        ? `?ageCategory=${scope.ageCategory.id}`
        : "";

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap"
      >
        {scope.kind === "source" ? (
          <>
            <Link
              href="/admin/sources"
              className="hover:text-foreground transition-colors"
            >
              Manbalar
            </Link>
            <ChevronRight className="size-3" aria-hidden />
            <Link
              href={`/admin/sources/${scope.source.id}`}
              className="hover:text-foreground transition-colors"
            >
              {scope.source.name}
            </Link>
          </>
        ) : scope.kind === "ageCategory" ? (
          <>
            <Link
              href="/admin/age-categories"
              className="hover:text-foreground transition-colors"
            >
              Yosh toifalari
            </Link>
            <ChevronRight className="size-3" aria-hidden />
            <Link
              href={`/admin/age-categories/${scope.ageCategory.id}`}
              className="hover:text-foreground transition-colors"
            >
              {scope.ageCategory.name}
            </Link>
          </>
        ) : (
          <Link
            href="/admin/topics"
            className="hover:text-foreground transition-colors"
          >
            Mavzular
          </Link>
        )}
        {ancestors.map((a) => (
          <span key={a.id} className="inline-flex items-center gap-1">
            <ChevronRight className="size-3" aria-hidden />
            <Link
              href={`/admin/topics/${a.id}${scopeHrefSuffix}`}
              className="hover:text-foreground transition-colors"
            >
              {a.name}
            </Link>
          </span>
        ))}
        <ChevronRight className="size-3" aria-hidden />
        <span className="text-foreground/80 font-medium">{topic.name}</span>
      </nav>

      {/* Header */}
      <header className="space-y-1.5">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold tracking-tight">{topic.name}</h1>
          <span className="text-xs text-muted-foreground font-mono">
            {topic.slug}
          </span>
          {scope.kind === "source" && (
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-2 py-0.5 rounded-md bg-[var(--accent-brand-soft)] text-[var(--accent-brand-strong)]">
              {scope.source.name}
            </span>
          )}
          {scope.kind === "ageCategory" && (
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-2 py-0.5 rounded-md bg-[var(--accent-brand-soft)] text-[var(--accent-brand-strong)]">
              {scope.ageCategory.name}
            </span>
          )}
        </div>
        {topic.description && (
          <p className="text-sm text-muted-foreground max-w-prose">
            {topic.description}
          </p>
        )}
      </header>

      {isParent ? (
        <ParentMode
          items={scope.kind === "none" ? unscopedChildren : scopedChildren}
          hrefSuffix={scopeHrefSuffix}
        />
      ) : (
        <LeafMode
          topicId={topic.id}
          sourceId={scope.kind === "source" ? scope.source.id : null}
          ageCategoryId={
            scope.kind === "ageCategory" ? scope.ageCategory.id : null
          }
          rawSearchParams={sp}
        />
      )}
    </div>
  );
}

type Scope =
  | { kind: "none" }
  | { kind: "source"; source: NonNullable<Awaited<ReturnType<typeof getSourceById>>> }
  | {
      kind: "ageCategory";
      ageCategory: NonNullable<Awaited<ReturnType<typeof getAgeCategoryById>>>;
    };

async function resolveScope({
  sourceId,
  ageCategoryId,
}: {
  sourceId?: string;
  ageCategoryId?: string;
}): Promise<Scope> {
  if (sourceId) {
    const source = await getSourceById(sourceId);
    if (source) return { kind: "source", source };
  }
  if (ageCategoryId) {
    const ageCategory = await getAgeCategoryById(ageCategoryId);
    if (ageCategory) return { kind: "ageCategory", ageCategory };
  }
  return { kind: "none" };
}

function ParentMode({
  items,
  hrefSuffix,
}: {
  items: (TopicWithCount | TopicInAgeCategory)[];
  hrefSuffix: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <TopicSearchInput placeholder="Bola mavzu qidirish…" />
      </div>
      <ChildrenList items={items} hrefSuffix={hrefSuffix} />
    </div>
  );
}

async function LeafMode({
  topicId,
  sourceId,
  ageCategoryId,
  rawSearchParams,
}: {
  topicId: string;
  sourceId: string | null;
  ageCategoryId: string | null;
  rawSearchParams: Record<string, string | string[] | undefined>;
}) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(rawSearchParams)) {
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

  // Always lock topic filter to this page's topic. Apply additional scope
  // filters only when their URL param is present.
  const scopedFilters = {
    ...filters,
    topicIds: [topicId],
    ...(sourceId ? { sourceIds: [sourceId] } : {}),
    ...(ageCategoryId ? { ageCategoryIds: [ageCategoryId] } : {}),
  };

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
