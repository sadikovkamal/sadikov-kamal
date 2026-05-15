import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { db } from "@/db";
import { topics, ageCategories } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { getProblemById } from "@/lib/problems/queries";
import { listSourcesWithCounts } from "@/lib/taxonomy/queries";
import { getPublicUrl } from "@/lib/storage/r2";
import { ProblemForm } from "@/components/problem-form";

export default async function EditProblemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const [p, topicsAvailable, sourcesAvailable, ageCategoriesAvailable] =
    await Promise.all([
      getProblemById(id),
      db.select().from(topics).orderBy(topics.name),
      listSourcesWithCounts(),
      db.select().from(ageCategories).orderBy(ageCategories.code),
    ]);
  if (!p) notFound();

  const title = [p.code, p.source?.name].filter(Boolean).join(" · ");

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-[11px] text-muted-foreground"
      >
        <Link
          href="/admin/problems"
          className="hover:text-foreground transition-colors"
        >
          Masalalar
        </Link>
        <ChevronRight className="size-3" aria-hidden />
        <Link
          href={`/admin/problems/${id}`}
          className="hover:text-foreground transition-colors truncate max-w-[280px]"
        >
          {title || "Masala"}
        </Link>
        <ChevronRight className="size-3" aria-hidden />
        <span className="text-foreground/80">Tahrirlash</span>
      </nav>

      {/* Header */}
      <header className="space-y-2 pb-5 border-b">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold tracking-tight">
            Masalani tahrirlash
          </h1>
        </div>
      </header>

      <ProblemForm
        mode="edit"
        problemId={id}
        defaultValues={{
          bodyMd: p.bodyMd,
          sourceId: p.sourceId,
          topicIds: p.topics.map((t) => t.id),
          ageCategoryIds: p.ageCategories.map((c) => c.id),
          image: p.images[0]
            ? {
                storageKey: p.images[0].storageKey,
                publicUrl: getPublicUrl(p.images[0].storageKey),
                originalFilename: p.images[0].originalFilename,
                sizeBytes: p.images[0].sizeBytes,
                mimeType: p.images[0].mimeType,
              }
            : null,
        }}
        topicsAvailable={topicsAvailable}
        sourcesAvailable={sourcesAvailable}
        ageCategoriesAvailable={ageCategoriesAvailable}
        uploadPrefix={`problems/${id}`}
      />
    </div>
  );
}
