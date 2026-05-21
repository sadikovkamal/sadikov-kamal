import Link from "next/link";
import dynamic from "next/dynamic";
import { sql, desc, gte } from "drizzle-orm";
import {
  ArrowUpRight,
  BookOpen,
  Database,
  FileText,
  Library,
  Plus,
  TrendingUp,
} from "lucide-react";
import { db } from "@/db";
import {
  problems,
  topics,
  sources,
  ageCategories,
  problemTopics,
  problemAgeCategories,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { cn, formatCount } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "./_components/page-header";

// recharts is ~200 KB and only the activity chart needs it. The rest of
// the dashboard is server-rendered HTML so it paints instantly.
const ActivityChart = dynamic(
  () => import("./dashboard-charts").then((m) => m.ActivityChart),
  {
    loading: () => (
      <div className="h-[140px] rounded-lg bg-muted/30 animate-pulse" />
    ),
  }
);

/**
 * Admin dashboard. Optimized for an admin building the database over
 * months/years — surfaces growth, coverage gaps, and a recent-activity
 * feed so they can spot what to work on next without poking around.
 *
 * Layout (top → bottom):
 *   1. KPI cards (4): total problems, topics, sources, age-category coverage.
 *   2. So'nggi 30 kun — area chart of daily additions.
 *   3. Mavzular bo'yicha + Manbalar bo'yicha — top-8 horizontal bar lists.
 *   4. Yosh toifalari qamrovi + So'nggi qo'shilganlar.
 */
export default async function AdminDashboard() {
  await requireAdmin();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    problemsCountRow,
    last7Row,
    topicsCountRow,
    sourcesCountRow,
    ageCategoriesAll,
    byTopic,
    bySource,
    byAgeCategory,
    activityRaw,
    recentProblems,
  ] = await Promise.all([
    db.select({ value: sql<number>`count(*)::int` }).from(problems),
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(problems)
      .where(gte(problems.createdAt, sevenDaysAgo)),
    db.select({ value: sql<number>`count(*)::int` }).from(topics),
    db.select({ value: sql<number>`count(*)::int` }).from(sources),
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
        code: topics.code,
        name: topics.name,
        count: sql<number>`count(*)::int`,
      })
      .from(problemTopics)
      .innerJoin(topics, sql`${topics.id} = ${problemTopics.topicId}`)
      .groupBy(topics.id, topics.code, topics.name)
      .orderBy(sql`count(*) desc`)
      .limit(8),
    db
      .select({
        code: sources.code,
        name: sources.name,
        count: sql<number>`count(*)::int`,
      })
      .from(problems)
      .innerJoin(sources, sql`${sources.id} = ${problems.sourceId}`)
      .groupBy(sources.id, sources.code, sources.name)
      .orderBy(sql`count(*) desc`)
      .limit(8),
    db
      .select({
        ageCategoryId: problemAgeCategories.ageCategoryId,
        count: sql<number>`count(*)::int`,
      })
      .from(problemAgeCategories)
      .groupBy(problemAgeCategories.ageCategoryId),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${problems.createdAt}), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(problems)
      .where(gte(problems.createdAt, thirtyDaysAgo))
      .groupBy(sql`date_trunc('day', ${problems.createdAt})`)
      .orderBy(sql`date_trunc('day', ${problems.createdAt})`),
    db
      .select({
        id: problems.id,
        code: problems.code,
        createdAt: problems.createdAt,
        sourceName: sources.name,
      })
      .from(problems)
      .leftJoin(sources, sql`${sources.id} = ${problems.sourceId}`)
      .orderBy(desc(problems.createdAt))
      .limit(6),
  ]);

  const totalProblems = problemsCountRow[0]?.value ?? 0;
  const last7 = last7Row[0]?.value ?? 0;
  const totalTopics = topicsCountRow[0]?.value ?? 0;
  const totalSources = sourcesCountRow[0]?.value ?? 0;

  const ageCountById = new Map(byAgeCategory.map((r) => [r.ageCategoryId, r.count]));
  const ageWithCounts = ageCategoriesAll.map((c) => ({
    ...c,
    count: ageCountById.get(c.id) ?? 0,
  }));
  const coveredAge = ageWithCounts.filter((c) => c.count > 0).length;
  const totalAge = ageWithCounts.length;

  // Densify the activity series into a fixed 30-day grid (zero-fill).
  // Chart looks cleaner when every day is present, and the area path
  // stays continuous instead of jumping across gaps.
  const activitySeries = densifyDays(activityRaw, 30);
  const last30Sum = activitySeries.reduce((a, d) => a + d.count, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Masalalar bazasining umumiy holati."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href="/admin/problems" />}
            >
              <FileText data-icon="inline-start" />
              Masalalar
            </Button>
            <Button
              size="sm"
              nativeButton={false}
              render={<Link href="/admin/problems/new" />}
            >
              <Plus data-icon="inline-start" />
              Yangi masala
            </Button>
          </>
        }
      />

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Masalalar"
          value={totalProblems}
          href="/admin/problems"
          icon={<FileText className="size-3.5" aria-hidden />}
          delta={
            last7 > 0
              ? { value: last7, label: "so'nggi 7 kun", tone: "up" }
              : { value: 0, label: "so'nggi 7 kun", tone: "flat" }
          }
        />
        <StatCard
          label="Mavzular"
          value={totalTopics}
          href="/admin/topics"
          icon={<Library className="size-3.5" aria-hidden />}
        />
        <StatCard
          label="Manbalar"
          value={totalSources}
          href="/admin/sources"
          icon={<Database className="size-3.5" aria-hidden />}
        />
        <StatCard
          label="Yosh toifalari"
          value={coveredAge}
          suffix={`/ ${totalAge}`}
          href="/admin/age-categories"
          icon={<BookOpen className="size-3.5" aria-hidden />}
          hint={
            coveredAge < totalAge
              ? `${totalAge - coveredAge} ta toifa hali bo'sh`
              : "barcha toifalar to'ldirilgan"
          }
        />
      </section>

      <Card>
        <CardHeader
          title="So'nggi 30 kun"
          right={
            <span className="text-[10px] text-muted-foreground tabular-nums">
              <TrendingUp className="inline size-3 mr-1" aria-hidden />
              {last30Sum} ta masala qo&apos;shildi
            </span>
          }
        />
        <div className="px-2 pb-2">
          <ActivityChart series={activitySeries} />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader
            title="Mavzular bo'yicha"
            right={
              <Link
                href="/admin/topics"
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Hammasi
              </Link>
            }
          />
          <BarList items={byTopic} emptyLabel="Hali masala yo'q" />
        </Card>
        <Card>
          <CardHeader
            title="Manbalar bo'yicha"
            right={
              <Link
                href="/admin/sources"
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Hammasi
              </Link>
            }
          />
          <BarList items={bySource} emptyLabel="Hali masala yo'q" />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3">
        <Card>
          <CardHeader
            title="Yosh toifalari qamrovi"
            right={
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {coveredAge} / {totalAge}
              </span>
            }
          />
          <div className="p-3 grid grid-cols-3 sm:grid-cols-4 gap-1.5">
            {ageWithCounts.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "rounded-md ring-1 px-2 py-1.5 transition-colors",
                  c.count > 0
                    ? "ring-foreground/10 bg-card"
                    : "ring-dashed ring-foreground/10 bg-muted/30"
                )}
              >
                <p
                  className={cn(
                    "text-xs font-medium leading-tight truncate",
                    c.count === 0 && "text-muted-foreground"
                  )}
                >
                  {c.name}
                </p>
                <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                  {c.count > 0 ? `${c.count} ta` : "bo'sh"}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="So'nggi qo'shilganlar"
            right={
              <Link
                href="/admin/problems"
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Hammasi
              </Link>
            }
          />
          {recentProblems.length === 0 ? (
            <Empty label="Hali masala qo'shilmagan" />
          ) : (
            <ul className="divide-y">
              {recentProblems.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/admin/problems/${p.code}`}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40 transition-colors group"
                  >
                    <code className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {p.code}
                    </code>
                    <span className="flex-1 min-w-0 text-sm truncate">
                      {p.sourceName ?? "Manba ko'rsatilmagan"}
                    </span>
                    <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                      {formatRelative(p.createdAt)}
                    </span>
                    <ArrowUpRight
                      className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ----------------------------- Primitives ------------------------------ */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl ring-1 ring-foreground/10 bg-card shadow-sm overflow-hidden">
      {children}
    </div>
  );
}

function CardHeader({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-foreground/5">
      <h3 className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
        {title}
      </h3>
      {right}
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
  icon,
  suffix,
  delta,
  hint,
}: {
  label: string;
  value: number;
  href: string;
  icon: React.ReactNode;
  suffix?: string;
  delta?: { value: number; label: string; tone: "up" | "flat" };
  hint?: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl ring-1 ring-foreground/10 bg-card shadow-sm hover:ring-foreground/30 hover:shadow-md transition-all p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          {icon}
          {label}
        </span>
        <ArrowUpRight
          className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
          aria-hidden
        />
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold tabular-nums tracking-tight">
          {formatCount(value)}
        </span>
        {suffix && (
          <span className="text-sm text-muted-foreground tabular-nums">
            {suffix}
          </span>
        )}
      </div>
      {delta && (
        <div className="mt-1 flex items-center gap-1 text-[11px]">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 tabular-nums font-medium",
              delta.tone === "up"
                ? "bg-[var(--accent-brand-soft)] text-[var(--accent-brand-strong)]"
                : "bg-muted text-muted-foreground"
            )}
          >
            {delta.tone === "up" ? "+" : ""}
            {delta.value}
          </span>
          <span className="text-muted-foreground">{delta.label}</span>
        </div>
      )}
      {hint && (
        <p className="mt-1 text-[11px] text-muted-foreground truncate">{hint}</p>
      )}
    </Link>
  );
}

/**
 * Horizontal bar list. Bars are scaled relative to the largest count
 * so the biggest item fills the row and the rest shrink proportionally.
 * Better than recharts for short lists — labels are crisp, no JS cost.
 */
function BarList({
  items,
  emptyLabel,
}: {
  items: Array<{ code: string; name: string; count: number }>;
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <Empty label={emptyLabel} />;
  }
  const max = items[0]?.count ?? 1;
  return (
    <ul className="p-3 space-y-1.5">
      {items.map((it) => {
        const pct = Math.max(2, Math.round((it.count / max) * 100));
        return (
          <li
            key={it.code}
            className="grid grid-cols-[1fr_auto] items-center gap-2 text-xs"
          >
            <div className="relative h-6 rounded-md bg-muted/40 ring-1 ring-foreground/5 overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-[var(--accent-brand)]/15 ring-1 ring-[var(--accent-brand)]/25 rounded-md transition-all"
                style={{ width: `${pct}%` }}
                aria-hidden
              />
              <span className="relative flex items-center h-full px-2 gap-2 truncate">
                <code className="font-mono text-[10px] tabular-nums text-muted-foreground">
                  {it.code}
                </code>
                <span className="truncate font-medium">{it.name}</span>
              </span>
            </div>
            <span className="font-medium tabular-nums text-foreground/80 w-10 text-right">
              {it.count}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
      {label}
    </div>
  );
}

/* ----------------------------- Helpers --------------------------------- */

function densifyDays(
  rows: Array<{ day: string; count: number }>,
  days: number
): Array<{ day: string; count: number }> {
  const byDay = new Map(rows.map((r) => [r.day, r.count]));
  const out: Array<{ day: string; count: number }> = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    out.push({ day: iso, count: byDay.get(iso) ?? 0 });
  }
  return out;
}

function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "hozir";
  if (diffMin < 60) return `${diffMin} daq oldin`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} soat oldin`;
  const diffD = Math.round(diffH / 24);
  if (diffD === 1) return "kecha";
  if (diffD < 7) return `${diffD} kun oldin`;
  if (diffD < 30) return `${Math.round(diffD / 7)} hafta oldin`;
  return date.toLocaleDateString("uz-UZ", {
    day: "numeric",
    month: "short",
  });
}
