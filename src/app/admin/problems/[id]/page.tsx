import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Pencil } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getProblemById } from "@/lib/problems/queries";
import { getPublicUrl } from "@/lib/storage/r2";
import { MarkdownPreview } from "@/components/markdown-preview";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DeleteProblemButton } from "./delete-button";

export default async function ProblemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const p = await getProblemById(id);
  if (!p) notFound();

  const title = [
    p.source?.name,
    p.year ? String(p.year) : null,
    p.problemNumber ? `#${p.problemNumber}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-xs text-muted-foreground"
      >
        <Link
          href="/admin/problems"
          className="hover:text-foreground transition-colors"
        >
          Masalalar
        </Link>
        {p.source?.name && (
          <>
            <ChevronRight className="size-3" aria-hidden />
            <span>{p.source.name}</span>
          </>
        )}
        {p.year && (
          <>
            <ChevronRight className="size-3" aria-hidden />
            <span className="tabular-nums">{p.year}</span>
          </>
        )}
        {p.problemNumber && (
          <>
            <ChevronRight className="size-3" aria-hidden />
            <span className="font-mono text-foreground/80">
              #{p.problemNumber}
            </span>
          </>
        )}
      </nav>

      {/* Title + actions */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-semibold tracking-tight min-w-0 break-words">
          {title || "Masala"}
        </h1>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <Link href={`/admin/problems/${id}/edit`}>
                <Pencil data-icon="inline-start" />
                Tahrirlash
              </Link>
            }
          />
          <DeleteProblemButton id={id} />
        </div>
      </header>

      {/* Two-column body */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-6">
        <article className="space-y-5 min-w-0">
          <Section title="Shart">
            <MarkdownPreview source={p.bodyMd} />
            {p.images.length > 0 && (
              <div className="mt-4 space-y-3">
                {p.images.map((img) => (
                  <div
                    key={img.id}
                    className="relative w-full overflow-hidden rounded-md ring-1 ring-foreground/10 bg-muted"
                  >
                    <Image
                      src={getPublicUrl(img.storageKey)}
                      alt={img.altText ?? img.originalFilename}
                      width={1200}
                      height={800}
                      sizes="(max-width: 1024px) 100vw, 800px"
                      className="h-auto w-full object-contain"
                      unoptimized
                    />
                  </div>
                ))}
              </div>
            )}
          </Section>

          {p.solutionMd && (
            <Section title="Yechim">
              <MarkdownPreview source={p.solutionMd} />
            </Section>
          )}

          {p.answer && (
            <Section title="Javob">
              <code className="inline-block bg-muted px-2.5 py-1 rounded-md font-mono text-xs">
                {p.answer}
              </code>
            </Section>
          )}
        </article>

        {/* Sticky metadata sidebar */}
        <aside className="lg:sticky lg:top-6 self-start">
          <div className="rounded-xl ring-1 ring-foreground/10 bg-card shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Tafsilotlar
              </span>
            </div>
            <div className="px-5 py-4 space-y-4">
              {p.source && (
                <MetaRow label="Manba">
                  <Link
                    href={`/admin/problems?source=${p.sourceId}`}
                    className="hover:text-foreground hover:underline underline-offset-4"
                  >
                    {p.source.name}
                  </Link>
                </MetaRow>
              )}
              {p.year && (
                <MetaRow label="Yil">
                  <span className="tabular-nums">{p.year}</span>
                </MetaRow>
              )}
              {p.problemNumber && (
                <MetaRow label="Raqami">
                  <span className="font-mono text-xs">{p.problemNumber}</span>
                </MetaRow>
              )}
              {p.classes.length > 0 && (
                <MetaRow label={p.classes.length > 1 ? "Sinflar" : "Sinf"}>
                  <div className="flex flex-wrap gap-1">
                    {p.classes.map((c) => (
                      <Link
                        key={c}
                        href={`/admin/problems?class=${c}`}
                        className="inline-flex items-center"
                      >
                        <Badge
                          variant="secondary"
                          className="text-[10px] font-normal py-0 px-1.5 tabular-nums hover:bg-muted-foreground/15 transition-colors"
                        >
                          {c}-sinf
                        </Badge>
                      </Link>
                    ))}
                  </div>
                </MetaRow>
              )}
              {p.topics.length > 0 && (
                <MetaRow label="Mavzular">
                  <div className="flex flex-wrap gap-1">
                    {p.topics.map((t) => (
                      <Link
                        key={t.id}
                        href={`/admin/problems?topic=${t.id}`}
                        className="inline-flex items-center"
                      >
                        <Badge
                          variant="outline"
                          className="text-[10px] font-normal py-0 px-1.5 hover:bg-muted/60 transition-colors"
                        >
                          {t.name}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                </MetaRow>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
        {title}
      </h2>
      <div className="rounded-xl ring-1 ring-foreground/10 bg-card shadow-sm px-5 py-4">
        {children}
      </div>
    </section>
  );
}

function MetaRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </div>
      <div className="text-[13px]">{children}</div>
    </div>
  );
}
