import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ageCategories, sources } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import {
  listSourcesWithCounts,
  listTopicsForSource,
} from "@/lib/taxonomy/queries";
import { Button } from "@/components/ui/button";
import { SourceLogo } from "../source-logo";
import { SourceAgeCategoryFilter } from "./source-age-category-filter";
import { SourceTopicsTree } from "./source-topics-tree";

/**
 * Per-source landing page: shown when a *leaf* source is clicked in the
 * explorer. Lists every topic that actually has problems in this source
 * as a tree, with each leaf clickable into a (source × topic) filtered
 * problems list.
 *
 * Parents in the source taxonomy don't reach this page — clicking a
 * parent card on /admin/sources navigates with `?parent=<code>` instead
 * and stays in the explorer view.
 */
export default async function SourceTopicsPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const { code } = await params;
  const sp = await searchParams;

  // Resolve the public S###### code to the internal UUID, then pull
  // everything we need for the header (source + parent chain + logo)
  // and the topics-used-in-this-source tree.
  const [source] = await db
    .select()
    .from(sources)
    .where(eq(sources.code, code))
    .limit(1);
  if (!source) notFound();

  // `?ageCategory=A000006,A000007` — same csv convention the problems
  // list uses. Empty / missing = no age restriction.
  const ageCsv = Array.isArray(sp.ageCategory)
    ? sp.ageCategory.join(",")
    : sp.ageCategory;
  const selectedAgeCategoryCodes = (ageCsv ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const [allSources, allAgeCategories] = await Promise.all([
    listSourcesWithCounts(),
    db
      .select({
        id: ageCategories.id,
        code: ageCategories.code,
        name: ageCategories.name,
      })
      .from(ageCategories)
      .orderBy(ageCategories.code),
  ]);
  const ageCodeToId = new Map(
    allAgeCategories.map((a) => [a.code, a.id])
  );
  const selectedAgeIds = selectedAgeCategoryCodes
    .map((c) => ageCodeToId.get(c))
    .filter((id): id is string => !!id);

  const topicsForSource = await listTopicsForSource(
    source.id,
    selectedAgeIds.length > 0 ? selectedAgeIds : undefined
  );

  // Walk back up the source tree so the breadcrumb shows the full path
  // (Manbalar > Olimpiadalar > IMO 2024) instead of a bare title.
  const byId = new Map(allSources.map((s) => [s.id, s]));
  const chain: typeof allSources = [];
  let cur = byId.get(source.id) ?? null;
  while (cur) {
    chain.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) ?? null : null;
  }
  // The current source is the last entry; the parents above it become
  // the breadcrumb links.
  const ancestors = chain.slice(0, -1);
  const logoPublicUrl =
    byId.get(source.id)?.logoPublicUrl ?? null;

  // Total problems in this source — same number that lives on the
  // explorer card, useful as a sanity number at the top of the page.
  const totalProblems = byId.get(source.id)?.problemCount ?? 0;

  const backHref = source.parentId
    ? `/admin/sources?parent=${byId.get(source.parentId)?.code ?? ""}`
    : "/admin/sources";

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Back + breadcrumb */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={
            <Link href={backHref}>
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
            href="/admin/sources"
            className="hover:text-foreground transition-colors"
          >
            Manbalar
          </Link>
          {ancestors.map((a) => (
            <span key={a.id} className="flex items-center gap-1">
              <ChevronRight className="size-3" aria-hidden />
              <Link
                href={`/admin/sources?parent=${a.code}`}
                className="hover:text-foreground transition-colors"
              >
                {a.name}
              </Link>
            </span>
          ))}
          <span className="flex items-center gap-1">
            <ChevronRight className="size-3" aria-hidden />
            <span className="text-foreground/80 font-medium">
              {source.name}
            </span>
          </span>
        </nav>
      </div>

      {/* Header — source logo + name + counts, age-category filter on
          the right. The filter narrows the tree below to topics that
          appear under (this source × selected age categories). */}
      <header className="flex items-start gap-4 pb-4 border-b">
        <SourceLogo
          name={source.name}
          publicUrl={logoPublicUrl}
          size="lg"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight truncate">
              {source.name}
            </h1>
            <code className="font-mono text-xs tabular-nums text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
              {source.code}
            </code>
          </div>
          <p className="text-sm text-muted-foreground tabular-nums">
            {totalProblems} ta masala · {topicsForSource.length} ta mavzu
          </p>
        </div>
        <div className="shrink-0 self-center">
          <SourceAgeCategoryFilter
            ageCategoriesAvailable={allAgeCategories}
            selectedAgeCategoryCodes={selectedAgeCategoryCodes}
          />
        </div>
      </header>

      {/* Topics tree */}
      {topicsForSource.length === 0 ? (
        <div className="rounded-xl ring-1 ring-foreground/10 bg-card shadow-sm px-6 py-12 text-center space-y-2">
          <p className="text-sm font-medium">
            Bu manbada hali masalalar yo&apos;q
          </p>
          <p className="text-xs text-muted-foreground">
            {"Masala qo'shilgach, mavzular ro'yxati shu yerda ko'rinadi."}
          </p>
        </div>
      ) : (
        <SourceTopicsTree
          topics={topicsForSource}
          sourceCode={source.code}
          selectedAgeCategoryCodes={selectedAgeCategoryCodes}
        />
      )}
    </div>
  );
}
