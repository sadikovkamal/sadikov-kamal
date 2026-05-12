import { db } from "@/db";
import { topics, sources } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { listProblems } from "@/lib/problems/queries";
import { parseSearchParams } from "./_url-state";
import { ProblemsTable } from "./problems-table";
import { NewProblemDialog } from "./new-problem-dialog";
import { ProblemSearchInput } from "./search-input";
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

  const [{ rows, total }, topicsAvailable, sourcesAvailable] =
    await Promise.all([
      listProblems(filters, sort, page, pageSize),
      db.select().from(topics).orderBy(topics.name),
      db.select().from(sources).orderBy(sources.name),
    ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Masalalar"
        subtitle={`Jami ${total.toLocaleString("en-US").replace(/,/g, " ")} ta`}
        actions={
          <NewProblemDialog
            topicsAvailable={topicsAvailable}
            sourcesAvailable={sourcesAvailable}
          />
        }
      />

      <div className="flex items-center gap-2 flex-wrap">
        <ProblemSearchInput />
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
