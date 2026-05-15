import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Pencil, PlusCircle } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getProblemById } from "@/lib/problems/queries";
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

  const hasChips = p.classes.length > 0 || p.topics.length > 0;

  return (
    <div className="space-y-6 max-w-4xl">
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

      {/* Hero card — title, taxonomy chips, answer, actions */}
      <header className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-semibold tracking-tight min-w-0 break-words">
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
        </div>

        {hasChips && (
          <div className="flex flex-wrap items-center gap-1.5">
            {p.classes.map((c) => (
              <Badge
                key={`class-${c}`}
                variant="secondary"
                className="text-[11px] font-medium py-0.5 px-2 tabular-nums"
              >
                {c}-sinf
              </Badge>
            ))}
            {p.topics.map((t) => (
              <Badge
                key={`topic-${t.id}`}
                variant="outline"
                className="text-[11px] font-normal py-0.5 px-2"
              >
                {t.name}
              </Badge>
            ))}
          </div>
        )}

        {p.answer && (
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Javob
            </span>
            <code className="inline-block bg-[var(--accent-brand-soft)] text-[var(--accent-brand-strong)] px-2.5 py-1 rounded-md font-mono text-xs">
              {p.answer}
            </code>
          </div>
        )}
      </header>

      {/* Body sections */}
      <Section title="Shart">
        <div className="rounded-xl border bg-card px-6 py-5">
          <MarkdownPreview source={p.bodyMd} />
        </div>
      </Section>

      <Section title="Yechim">
        {p.solutionMd ? (
          <div className="rounded-xl border bg-card px-6 py-5">
            <MarkdownPreview source={p.solutionMd} />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed bg-card/50 px-6 py-8 flex flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">
              Yechim qo'shilmagan
            </p>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={
                <Link href={`/admin/problems/${id}/edit`}>
                  <PlusCircle data-icon="inline-start" />
                  Yechim yozish
                </Link>
              }
            />
          </div>
        )}
      </Section>
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
    <section className="space-y-2.5">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground/70 border-b pb-1.5">
        {title}
      </h2>
      {children}
    </section>
  );
}
