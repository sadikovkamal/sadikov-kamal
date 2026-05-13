import Link from "next/link";
import dynamic from "next/dynamic";
import { sql } from "drizzle-orm";
import { ArrowUpRight } from "lucide-react";
import { db } from "@/db";
import {
  problems,
  topics,
  sources,
  problemTopics,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { formatCount } from "@/lib/utils";
import { PageHeader } from "./_components/page-header";

// recharts is ~200 KB of JS — split it off the dashboard's initial bundle
// so the stat cards paint immediately and the charts stream in once their
// JS arrives.
const DashboardCharts = dynamic(
  () => import("./dashboard-charts").then((m) => m.DashboardCharts),
  {
    loading: () => (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-lg border bg-card h-[244px] animate-pulse" />
        <div className="rounded-lg border bg-card h-[244px] animate-pulse" />
      </div>
    ),
  }
);

export default async function AdminDashboard() {
  await requireAdmin();

  const [
    problemsCountRow,
    topicsCountRow,
    sourcesCountRow,
    byTopic,
    bySource,
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
