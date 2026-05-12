import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { ArrowUpRight } from "lucide-react";
import { db } from "@/db";
import {
  problems,
  topics,
  sources,
  problemTopics,
  importBatches,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { formatCount, formatDateTime } from "@/lib/utils";
import { DashboardCharts } from "./dashboard-charts";
import { PageHeader } from "./_components/page-header";

const STATUS_LABELS: Record<string, string> = {
  success: "muvaffaqiyatli",
  partial: "qisman",
  failed: "xato",
  pending: "kutilmoqda",
  processing: "ishlamoqda",
};
const STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  success: "default",
  partial: "secondary",
  failed: "destructive",
  pending: "outline",
  processing: "outline",
};

export default async function AdminDashboard() {
  await requireAdmin();

  const [
    problemsCountRow,
    topicsCountRow,
    sourcesCountRow,
    byTopic,
    bySource,
    recentImports,
  ] = await Promise.all([
    db.select({ value: sql<number>`count(*)::int` }).from(problems),
    db.select({ value: sql<number>`count(*)::int` }).from(topics),
    db.select({ value: sql<number>`count(*)::int` }).from(sources),
    db
      .select({
        topicName: topics.name,
        count: sql<number>`count(*)::int`,
      })
      .from(problemTopics)
      .innerJoin(topics, sql`${topics.id} = ${problemTopics.topicId}`)
      .groupBy(topics.id, topics.name)
      .orderBy(sql`count(*) desc`)
      .limit(8),
    db
      .select({
        sourceName: sources.name,
        count: sql<number>`count(*)::int`,
      })
      .from(problems)
      .innerJoin(sources, sql`${sources.id} = ${problems.sourceId}`)
      .groupBy(sources.id, sources.name)
      .orderBy(sql`count(*) desc`)
      .limit(8),
    db
      .select()
      .from(importBatches)
      .orderBy(desc(importBatches.createdAt))
      .limit(5),
  ]);

  const totalProblems = problemsCountRow[0]?.value ?? 0;
  const totalTopics = topicsCountRow[0]?.value ?? 0;
  const totalSources = sourcesCountRow[0]?.value ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Masalalar bazasining umumiy holati."
      />

      <section className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard label="Masalalar" value={totalProblems} href="/admin/problems" />
        <StatCard label="Mavzular" value={totalTopics} href="/admin/topics" />
        <StatCard label="Manbalar" value={totalSources} href="/admin/sources" />
      </section>

      <DashboardCharts byTopic={byTopic} bySource={bySource} />

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">So&apos;nggi importlar</h2>
          <Link
            href="/admin/import"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
          >
            Hammasi
            <ArrowUpRight className="size-3" aria-hidden />
          </Link>
        </div>
        <div className="rounded-lg border bg-card divide-y text-sm overflow-hidden">
          {recentImports.length === 0 && (
            <div className="py-10 px-4 text-center text-sm text-muted-foreground">
              Hali import qilinmagan.
            </div>
          )}
          {recentImports.map((b) => (
            <Link
              key={b.id}
              href={`/admin/import/${b.id}`}
              className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/60 transition-colors"
            >
              <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                <span className="truncate text-[13px] font-medium">
                  {b.filename}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {b.successCount} / {b.totalCount} ·{" "}
                  {formatDateTime(b.createdAt)}
                </span>
              </div>
              <Badge
                variant={STATUS_VARIANTS[b.status] ?? "outline"}
                className="shrink-0 text-[10px] px-1.5 py-0"
              >
                {STATUS_LABELS[b.status] ?? b.status}
              </Badge>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border bg-card p-4 hover:border-foreground/30 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground font-medium">
          {label}
        </span>
        <ArrowUpRight
          className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
          aria-hidden
        />
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
        {formatCount(value)}
      </div>
    </Link>
  );
}
