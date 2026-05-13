import Link from "next/link";
import { sql } from "drizzle-orm";
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

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sinflar"
        subtitle="Masalalarni sinflar bo'yicha ko'rish."
      />

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
        {CLASS_NUMBERS.map((n) => {
          const count = counts.get(n) ?? 0;
          const empty = count === 0;
          return (
            <Link
              key={n}
              href={`/admin/problems?class=${n}`}
              className="group rounded-lg border bg-card p-3 hover:border-foreground/30 transition-colors text-center"
            >
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Sinf
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {n}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground tabular-nums">
                {empty ? "—" : `${count} ta`}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
