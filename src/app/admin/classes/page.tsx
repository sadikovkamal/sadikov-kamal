import Link from "next/link";
import { sql } from "drizzle-orm";
import { ArrowUpRight } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/db";
import { problemClasses } from "@/db/schema";
import { CLASS_NUMBERS } from "@/lib/classes";
import { PageHeader } from "../_components/page-header";

export default async function ClassesPage() {
  await requireAdmin();

  const rows = await db
    .select({
      classNumber: problemClasses.classNumber,
      count: sql<number>`count(*)::int`,
    })
    .from(problemClasses)
    .groupBy(problemClasses.classNumber);

  const counts = new Map<number, number>(
    rows.map((r) => [r.classNumber, r.count])
  );
  const totalProblems = rows.reduce((s, r) => s + r.count, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sinflar"
        subtitle={`Masalalar sinflar bo'yicha taqsimlangan · Jami ${totalProblems} ta yozuv.`}
      />

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3">
        {CLASS_NUMBERS.map((n) => {
          const count = counts.get(n) ?? 0;
          const empty = count === 0;
          return (
            <Link
              key={n}
              href={`/admin/problems?class=${n}`}
              aria-disabled={empty}
              className="group relative rounded-xl ring-1 ring-foreground/10 bg-card shadow-sm hover:ring-foreground/30 hover:shadow-md transition-all p-4 overflow-hidden"
            >
              {/* Top eyebrow */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  Sinf
                </span>
                <ArrowUpRight
                  className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-hidden
                />
              </div>

              {/* Grade number — big focal */}
              <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
                {n}
              </div>

              {/* Count */}
              <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                {empty ? (
                  <span className="text-muted-foreground/60">Bo&apos;sh</span>
                ) : (
                  `${count} ta masala`
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
