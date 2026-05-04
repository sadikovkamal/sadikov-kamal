import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  problems,
  topics,
  sources,
  tags,
  problemTopics,
  importBatches,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { DashboardCharts } from "./dashboard-charts";

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
    tagsCountRow,
    byTopic,
    bySource,
    byDifficulty,
    recentImports,
  ] = await Promise.all([
    db.select({ value: sql<number>`count(*)::int` }).from(problems),
    db.select({ value: sql<number>`count(*)::int` }).from(topics),
    db.select({ value: sql<number>`count(*)::int` }).from(sources),
    db.select({ value: sql<number>`count(*)::int` }).from(tags),
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
      .select({
        difficulty: problems.difficulty,
        count: sql<number>`count(*)::int`,
      })
      .from(problems)
      .groupBy(problems.difficulty)
      .orderBy(problems.difficulty),
    db
      .select()
      .from(importBatches)
      .orderBy(desc(importBatches.createdAt))
      .limit(5),
  ]);

  const totalProblems = problemsCountRow[0]?.value ?? 0;
  const totalTopics = topicsCountRow[0]?.value ?? 0;
  const totalSources = sourcesCountRow[0]?.value ?? 0;
  const totalTags = tagsCountRow[0]?.value ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Boshqaruv paneli</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Masalalar"
          value={totalProblems}
          href="/admin/problems"
        />
        <StatCard label="Mavzular" value={totalTopics} href="/admin/topics" />
        <StatCard label="Manbalar" value={totalSources} href="/admin/sources" />
        <StatCard label="Teglar" value={totalTags} href="/admin/tags" />
      </div>

      <DashboardCharts
        byTopic={byTopic}
        bySource={bySource}
        byDifficulty={byDifficulty}
      />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">So&apos;nggi importlar</h2>
        <div className="border rounded-md divide-y text-sm">
          {recentImports.length === 0 && (
            <div className="p-3 text-muted-foreground">
              Hali import qilinmagan.
            </div>
          )}
          {recentImports.map((b) => (
            <Link
              key={b.id}
              href={`/admin/import/${b.id}`}
              className="block p-3 hover:bg-muted"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{b.filename}</span>
                <Badge variant={STATUS_VARIANTS[b.status] ?? "outline"}>
                  {STATUS_LABELS[b.status] ?? b.status}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {b.successCount} / {b.totalCount} ·{" "}
                {new Date(b.createdAt).toLocaleString("uz-UZ")}
              </div>
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
      className="border rounded-md p-4 hover:bg-muted transition-colors"
    >
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-3xl font-bold mt-1">
        {value.toLocaleString("uz-UZ")}
      </div>
    </Link>
  );
}
