import Link from "next/link";
import { desc } from "drizzle-orm";
import { Inbox } from "lucide-react";
import { db } from "@/db";
import { importBatches } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { ImportUploader } from "./import-uploader";
import { PageHeader } from "../_components/page-header";

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

export default async function ImportPage() {
  await requireAdmin();
  const recent = await db
    .select()
    .from(importBatches)
    .orderBy(desc(importBatches.createdAt))
    .limit(10);

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Bulk import"
        subtitle="ZIP arxiv orqali bir nechta masalani birdaniga qo'shing."
      />

      <section className="rounded-xl ring-1 ring-foreground/10 bg-card shadow-sm p-5">
        <ImportUploader />
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
            So&apos;nggi importlar
          </h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            {recent.length} ta
          </span>
        </div>

        {recent.length === 0 ? (
          <div className="rounded-xl ring-1 ring-foreground/10 bg-card shadow-sm px-6 py-12 text-center space-y-2">
            <Inbox
              className="size-7 mx-auto text-muted-foreground"
              aria-hidden
              strokeWidth={1.5}
            />
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Hali import qilinmagan</p>
              <p className="text-xs text-muted-foreground">
                Yuqoridagi forma orqali birinchi arxivni yuklang.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl ring-1 ring-foreground/10 bg-card shadow-sm divide-y overflow-hidden">
            {recent.map((b) => (
              <Link
                key={b.id}
                href={`/admin/import/${b.id}`}
                className="group flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-medium truncate group-hover:text-foreground">
                    {b.filename}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {b.successCount} / {b.totalCount} muvaffaqiyatli ·{" "}
                    {formatDateTime(b.createdAt)}
                  </p>
                </div>
                <Badge
                  variant={STATUS_VARIANTS[b.status] ?? "outline"}
                  className="shrink-0 text-[10px] font-normal py-0 px-1.5"
                >
                  {STATUS_LABELS[b.status] ?? b.status}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
