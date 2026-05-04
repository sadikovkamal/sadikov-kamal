import Link from "next/link";
import { db } from "@/db";
import { topics, sources, tags } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { listProblems } from "@/lib/problems/queries";
import { Button } from "@/components/ui/button";
import { parseSearchParams } from "./_url-state";
import { ProblemFiltersSidebar } from "./filters-sidebar";
import { ProblemsTable } from "./problems-table";

export default async function ProblemsListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  // Re-build a URLSearchParams so the parser only has to deal with one shape.
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      // Same key repeated → join with commas (matches our CSV convention).
      v.forEach((x) => {
        const existing = usp.get(k);
        usp.set(k, existing ? `${existing},${x}` : x);
      });
    } else {
      usp.set(k, v);
    }
  }
  const { filters, sort, page, pageSize } = parseSearchParams(usp);

  const [{ rows, total }, allTopics, allSources, allTags] = await Promise.all([
    listProblems(filters, sort, page, pageSize),
    db.select().from(topics).orderBy(topics.name),
    db.select().from(sources).orderBy(sources.name),
    db.select().from(tags).orderBy(tags.name),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Masalalar</h1>
          <p className="text-muted-foreground text-sm">
            {total.toLocaleString("uz-UZ")} ta jami
          </p>
        </div>
        <Button render={<Link href="/admin/problems/new">+ Yangi masala</Link>} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        <ProblemFiltersSidebar
          allTopics={allTopics}
          allSources={allSources}
          allTags={allTags}
          currentFilters={filters}
        />
        <ProblemsTable
          rows={rows}
          total={total}
          page={page}
          pageSize={pageSize}
          sort={sort}
        />
      </div>
    </div>
  );
}
