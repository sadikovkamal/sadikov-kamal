import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/db";
import { ageCategories, sources, topics } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { listProblems } from "@/lib/problems/queries";
import { Button } from "@/components/ui/button";
import { parseSearchParams } from "./_url-state";
import { ProblemsList } from "./problems-list";
import { ProblemsFilterBar } from "./filters";
import { PageHeader } from "../_components/page-header";

export default async function ProblemsListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
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

  // Fetch the filter dictionaries alongside the page rows. All three
  // taxonomies are small (low hundreds of rows), so it's cheaper to
  // ship the full list to the client and filter in-memory than to
  // round-trip per popover open.
  const [
    { rows, total },
    sourcesAvailable,
    ageCategoriesAvailable,
    topicsAvailable,
  ] = await Promise.all([
    listProblems(filters, sort, page, pageSize),
    db
      .select({
        id: sources.id,
        code: sources.code,
        name: sources.name,
        parentId: sources.parentId,
      })
      .from(sources)
      .orderBy(sources.code),
    db
      .select({
        id: ageCategories.id,
        code: ageCategories.code,
        name: ageCategories.name,
      })
      .from(ageCategories)
      .orderBy(ageCategories.code),
    db
      .select({
        id: topics.id,
        code: topics.code,
        name: topics.name,
        parentId: topics.parentId,
      })
      .from(topics)
      .orderBy(topics.name),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Masalalar"
        subtitle={`Jami ${total.toLocaleString("en-US").replace(/,/g, " ")} ta`}
        actions={
          <Button
            size="sm"
            nativeButton={false}
            render={
              <Link href="/admin/problems/new">
                <Plus data-icon="inline-start" />
                Yangi masala
              </Link>
            }
          />
        }
      />

      <ProblemsFilterBar
        sourcesAvailable={sourcesAvailable}
        ageCategoriesAvailable={ageCategoriesAvailable}
        topicsAvailable={topicsAvailable}
        sort={sort}
      />

      <ProblemsList
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
      />
    </div>
  );
}
