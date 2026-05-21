import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, GraduationCap } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ageCategories, sources } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { listTopicsForAgeCategory } from "@/lib/taxonomy/queries";
import { Button } from "@/components/ui/button";
import { AgeCategorySourceFilter } from "./age-category-source-filter";
import { AgeCategoryTopicsTree } from "./age-category-topics-tree";

/**
 * Per-age-category landing page. Mirrors the per-source page at
 * /admin/sources/[code] — clicking a card on /admin/age-categories
 * lands here and shows every topic that actually has problems in
 * this age category as a connected tree. Each row navigates into a
 * (topic × ageCategory) filtered problems list; source is *not*
 * applied, per product decision (age categories filter audience,
 * not provenance).
 */
export default async function AgeCategoryTopicsPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const { code } = await params;
  const sp = await searchParams;

  const [category] = await db
    .select()
    .from(ageCategories)
    .where(eq(ageCategories.code, code))
    .limit(1);
  if (!category) notFound();

  // `?source=S000001,S000002` — same csv convention the problems list
  // uses. Empty / missing = no source restriction (all sources).
  const sourceCsv = Array.isArray(sp.source) ? sp.source.join(",") : sp.source;
  const selectedSourceCodes = (sourceCsv ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Pull every source so we can both translate codes → UUIDs for the
  // query and feed the filter popover the same dictionary the problems
  // page uses.
  const allSources = await db
    .select({
      id: sources.id,
      code: sources.code,
      name: sources.name,
      parentId: sources.parentId,
    })
    .from(sources)
    .orderBy(sources.code);

  // Cascade expansion: if the user selects a parent source, count its
  // whole subtree. Mirrors the listProblems source-filter behavior so
  // both pages interpret the same `?source=` value identically.
  const { withDescendants } = await import("@/lib/taxonomy/hierarchy");
  const codeToId = new Map(allSources.map((s) => [s.code, s.id]));
  const idsFromCodes = selectedSourceCodes
    .map((c) => codeToId.get(c))
    .filter((id): id is string => !!id);
  const expandedSourceIds =
    idsFromCodes.length > 0
      ? withDescendants(idsFromCodes, allSources)
      : [];

  const topicsForCategory = await listTopicsForAgeCategory(
    category.id,
    expandedSourceIds.length > 0 ? expandedSourceIds : undefined
  );

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Back + breadcrumb */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={
            <Link href="/admin/age-categories">
              <ArrowLeft data-icon="inline-start" />
              Orqaga
            </Link>
          }
        />
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
          <span className="flex items-center gap-1">
            <ChevronRight className="size-3" aria-hidden />
            <span className="text-foreground/80 font-medium">
              {category.name}
            </span>
          </span>
        </nav>
      </div>

      {/* Header — graduation icon + name + code, source filter on the
          right. The filter narrows the tree below to topics that
          appear under (this age category × selected sources). */}
      <header className="flex items-start gap-4 pb-4 border-b">
        <div
          className="size-14 shrink-0 rounded-lg flex items-center justify-center bg-[var(--accent-brand)]/8 text-[var(--accent-brand-strong)] ring-1 ring-[var(--accent-brand)]/15"
          aria-hidden
        >
          <GraduationCap className="size-7" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight truncate">
              {category.name}
            </h1>
            <code className="font-mono text-xs tabular-nums text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
              {category.code}
            </code>
          </div>
          <p className="text-sm text-muted-foreground tabular-nums">
            {topicsForCategory.length} ta mavzu
          </p>
        </div>
        <div className="shrink-0 self-center">
          <AgeCategorySourceFilter
            sourcesAvailable={allSources}
            selectedSourceCodes={selectedSourceCodes}
          />
        </div>
      </header>

      {/* Topics tree */}
      {topicsForCategory.length === 0 ? (
        <div className="rounded-xl ring-1 ring-foreground/10 bg-card shadow-sm px-6 py-12 text-center space-y-2">
          <p className="text-sm font-medium">
            Bu yosh toifasida hali masalalar yo&apos;q
          </p>
          <p className="text-xs text-muted-foreground">
            {"Masala qo'shilgach, mavzular ro'yxati shu yerda ko'rinadi."}
          </p>
        </div>
      ) : (
        <AgeCategoryTopicsTree
          topics={topicsForCategory}
          ageCategoryCode={category.code}
          selectedSourceCodes={selectedSourceCodes}
        />
      )}
    </div>
  );
}
