import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { importBatches } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { ImportUploader } from "./import-uploader";

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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Bulk import</h1>
        <p className="text-muted-foreground text-sm">
          ZIP bundle yuklang, format spec'i: <code>docs/format-spec.md</code>.
        </p>
      </div>

      <ImportUploader />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">So'nggi importlar</h2>
        <div className="border rounded-md divide-y">
          {recent.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">
              Hali import qilinmagan.
            </div>
          )}
          {recent.map((b) => (
            <Link
              key={b.id}
              href={`/admin/import/${b.id}`}
              className="block p-3 hover:bg-muted text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium truncate">{b.filename}</span>
                <Badge variant={STATUS_VARIANTS[b.status] ?? "outline"}>
                  {STATUS_LABELS[b.status] ?? b.status}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {b.successCount} / {b.totalCount} muvaffaqiyatli ·{" "}
                {new Date(b.createdAt).toLocaleString("uz-UZ")}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
