import Link from "next/link";
import { Plus } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { listProblems } from "@/lib/problems/queries";
import { Button } from "@/components/ui/button";
import { parseSearchParams } from "./_url-state";
import { ProblemsTable } from "./problems-table";
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

  const { rows, total } = await listProblems(filters, sort, page, pageSize);

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
