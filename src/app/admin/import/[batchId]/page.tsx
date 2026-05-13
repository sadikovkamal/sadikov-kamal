import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { importBatches, problems, users, sources } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
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

  // The errorLog column is stored as JSONB; type it loosely and validate
  // shape at runtime.
  const errorLog: ErrorEntry[] = Array.isArray(batch.errorLog)
    ? (batch.errorLog as ErrorEntry[])
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold break-all">{batch.filename}</h1>
        <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground flex-wrap">
          <Badge variant={STATUS_VARIANTS[batch.status] ?? "outline"}>
            {STATUS_LABELS[batch.status] ?? batch.status}
          </Badge>
          <span>
            {batch.successCount} / {batch.totalCount} muvaffaqiyatli
          </span>
          <span>·</span>
          <span>{uploader?.fullName ?? "?"}</span>
          <span>·</span>
          <span>{formatDateTime(batch.createdAt)}</span>
          {batch.finishedAt && (
            <>
              <span>·</span>
              <span>tugadi: {formatDateTime(batch.finishedAt)}</span>
            </>
          )}
        </div>
      </div>

      {errorLog.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{"Xatolar va o'tkazib yuborishlar"}</h2>
          <div className="border rounded-md divide-y text-xs">
            {errorLog.map((e, i) => (
              <div key={i} className="p-2 flex flex-wrap gap-2">
                <span className="font-mono text-muted-foreground">
                  {e.sourcePath}
                </span>
                <span className="text-destructive">{e.error}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">
          Import qilingan masalalar ({importedProblems.length})
        </h2>
        <div className="border rounded-md divide-y">
          {importedProblems.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground">
              {"Bu batch'dan hech qanday masala import qilinmagan."}
            </div>
          )}
          {importedProblems.map((p) => (
            <Link
              key={p.id}
              href={`/admin/problems/${p.id}`}
              className="block p-3 hover:bg-muted text-sm"
            >
              {p.sourceName ?? "—"}
              {p.year ? ` ${p.year}` : ""}
              {p.problemNumber ? ` · ${p.problemNumber}` : ""}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
