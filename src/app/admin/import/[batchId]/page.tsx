import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { ChevronRight, AlertTriangle } from "lucide-react";
import { db } from "@/db";
import { importBatches, problems, users, sources } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

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

const STATUS_LABELS: Record<string, string> = {
  success: "muvaffaqiyatli",
  partial: "qisman",
  failed: "xato",
  pending: "kutilmoqda",
  processing: "ishlamoqda",
};

interface ErrorEntry {
  index: number;
  sourcePath: string;
  error: string;
}

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  await requireAdmin();
  const { batchId } = await params;

  const batch = await db.query.importBatches.findFirst({
    where: eq(importBatches.id, batchId),
  });
  if (!batch) notFound();

  const [uploader, importedProblems] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, batch.uploadedBy) }),
    db
      .select({
        id: problems.id,
        year: problems.year,
        problemNumber: problems.problemNumber,
        sourceName: sources.name,
        createdAt: problems.createdAt,
      })
      .from(problems)
      .leftJoin(sources, eq(sources.id, problems.sourceId))
      .where(eq(problems.importBatchId, batchId))
      .orderBy(desc(problems.createdAt)),
  ]);

  const errorLog: ErrorEntry[] = Array.isArray(batch.errorLog)
    ? (batch.errorLog as ErrorEntry[])
    : [];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-[11px] text-muted-foreground"
      >
        <Link
          href="/admin/import"
          className="hover:text-foreground transition-colors"
        >
          Bulk import
        </Link>
        <ChevronRight className="size-3" aria-hidden />
        <span className="text-foreground/80 truncate max-w-[300px]">
          {batch.filename}
        </span>
      </nav>

      {/* Header */}
      <header className="space-y-3 pb-5 border-b">
        <h1 className="text-xl font-semibold tracking-tight break-all">
          {batch.filename}
        </h1>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <Badge
            variant={STATUS_VARIANTS[batch.status] ?? "outline"}
            className="text-[10px] font-normal py-0 px-1.5"
          >
            {STATUS_LABELS[batch.status] ?? batch.status}
          </Badge>
          <Meta label="Natija">
            <span className="tabular-nums">
              {batch.successCount} / {batch.totalCount}
            </span>
          </Meta>
          <Meta label="Yuklagan">{uploader?.fullName ?? "?"}</Meta>
          <Meta label="Boshlandi">{formatDateTime(batch.createdAt)}</Meta>
          {batch.finishedAt && (
            <Meta label="Tugadi">{formatDateTime(batch.finishedAt)}</Meta>
          )}
        </div>
      </header>

      {errorLog.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle
              className="size-3.5 text-destructive"
              aria-hidden
            />
            <h2 className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
              {"Xatolar va o'tkazib yuborishlar"}
            </h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              ({errorLog.length})
            </span>
          </div>
          <div className="rounded-xl ring-1 ring-destructive/20 bg-destructive/5 divide-y divide-destructive/10 overflow-hidden">
            {errorLog.map((e, i) => (
              <div
                key={i}
                className="px-4 py-2.5 flex flex-wrap gap-x-3 gap-y-1 text-xs"
              >
                <code className="font-mono text-muted-foreground shrink-0">
                  {e.sourcePath}
                </code>
                <span className="text-destructive flex-1 min-w-0">
                  {e.error}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
            Import qilingan masalalar
          </h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            {importedProblems.length} ta
          </span>
        </div>

        {importedProblems.length === 0 ? (
          <div className="rounded-xl ring-1 ring-foreground/10 bg-card shadow-sm px-6 py-10 text-center text-sm text-muted-foreground">
            {"Bu arxivdan hech qanday masala import qilinmagan."}
          </div>
        ) : (
          <div className="rounded-xl ring-1 ring-foreground/10 bg-card shadow-sm divide-y overflow-hidden">
            {importedProblems.map((p) => (
              <Link
                key={p.id}
                href={`/admin/problems/${p.id}`}
                className="group flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="text-sm font-medium truncate">
                    {p.sourceName ?? "—"}
                  </span>
                  {p.year && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {p.year}
                    </span>
                  )}
                  {p.problemNumber && (
                    <code className="text-xs text-muted-foreground font-mono">
                      #{p.problemNumber}
                    </code>
                  )}
                </div>
                <ChevronRight
                  className="size-3.5 text-muted-foreground/50 group-hover:text-foreground transition-colors shrink-0"
                  aria-hidden
                />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Meta({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
        {label}
      </span>
      <span className="text-foreground/80">{children}</span>
    </span>
  );
}
