import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  ChevronRight,
  Hash,
  Library,
  Pencil,
  Tags,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getProblemByCode } from "@/lib/problems/queries";
import { MarkdownPreview } from "@/components/markdown-preview";
import { Button } from "@/components/ui/button";
import { DeleteProblemButton } from "./delete-button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: code } = await params;
  return {
    title: `${code} — Admin`,
  };
}

export default async function ProblemDetailPage({
  params,
}: {
  // The dynamic segment is the problem's P####### code, not its UUID.
  // We keep the param name `id` so the folder structure stays
  // `app/admin/problems/[id]` — only the value contract changed.
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id: code } = await params;
  const p = await getProblemByCode(code);
  if (!p) notFound();

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
        <ChevronRight className="size-3" aria-hidden />
        <span className="font-mono tabular-nums text-foreground/80">
          {p.code}
        </span>
        {p.source?.name && (
          <>
            <ChevronRight className="size-3" aria-hidden />
            <span className="truncate">{p.source.name}</span>
          </>
        )}
      </nav>

      {/* Title + actions */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <code className="font-mono text-xs tabular-nums text-muted-foreground bg-muted/60 rounded px-2 py-1 shrink-0">
            {p.code}
          </code>
          <h1 className="text-xl font-semibold tracking-tight min-w-0 break-words">
            {p.source?.name ?? "Masala"}
          </h1>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <Link href={`/admin/problems/${p.code}/edit`}>
                <Pencil data-icon="inline-start" />
                Tahrirlash
              </Link>
            }
          />
          <DeleteProblemButton code={p.code} />
        </div>
      </header>

      {/* Two-column body */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-6">
        <article className="min-w-0">
          {/* Body — editorial reading surface. The card is a single
              padded panel with no header label (the breadcrumb already
              names the section as "shart"). Images inside the markdown
              are capped at ~640px and centered so a 1200×800 photo
              doesn't dominate the column; the executor already inlined
              every ![](images/foo.png) reference as an absolute R2 URL,
              so MarkdownPreview is the only image surface. */}
          <div className="rounded-xl ring-1 ring-foreground/10 bg-card shadow-sm px-6 py-6 md:px-8 md:py-7">
            <MarkdownPreview
              source={p.bodyMd}
              className="[&_img]:max-w-[640px] [&_img]:mx-auto [&_img]:block [&_img]:my-6"
            />
          </div>
        </article>

        {/* Sticky metadata sidebar. Every taxonomy entry is a chip-link
            into the matching filter so the admin can pivot from one
            problem into the related set with a single click. URLs use
            taxonomy codes (T###### / S###### / A######) — matches the
            list URL contract. */}
        <aside className="lg:sticky lg:top-6 self-start">
          <div className="rounded-xl ring-1 ring-foreground/10 bg-card shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Tafsilotlar
              </span>
            </div>
            <div className="px-5 py-4 space-y-4">
              {p.source && (
                <MetaRow label="Manba" icon={Library}>
                  <Link
                    href={`/admin/problems?source=${p.source.code}`}
                    title={`Faqat ${p.source.name} manbasi`}
                    className="inline-flex items-center gap-1 rounded-md ring-1 ring-foreground/10 bg-muted/40 hover:bg-muted hover:ring-foreground/25 px-1.5 py-0.5 text-[11px] font-medium text-foreground/85 transition-colors max-w-full"
                  >
                    <span className="truncate">{p.source.name}</span>
                  </Link>
                </MetaRow>
              )}

              <MetaRow label="Qo&apos;shilgan" icon={CalendarDays}>
                <time
                  dateTime={p.createdAt.toISOString()}
                  className="tabular-nums text-xs text-foreground/80"
                >
                  {p.createdAt.toLocaleDateString("uz-UZ", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </time>
              </MetaRow>

              {p.ageCategories.length > 0 && (
                <MetaRow label="Yosh toifasi" icon={Hash}>
                  <div className="flex flex-wrap gap-1">
                    {p.ageCategories.map((c) => (
                      <Link
                        key={c.id}
                        href={`/admin/problems?ageCategory=${c.code}`}
                        title={`Faqat ${c.name}`}
                        className="inline-flex items-center rounded-md ring-1 ring-foreground/10 bg-muted/40 hover:bg-muted hover:ring-foreground/25 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {c.name}
                      </Link>
                    ))}
                  </div>
                </MetaRow>
              )}

              {p.topics.length > 0 && (
                <MetaRow label="Mavzular" icon={Tags}>
                  <div className="flex flex-wrap gap-1">
                    {p.topics.map((t) => (
                      <Link
                        key={t.id}
                        href={`/admin/problems?topic=${t.code}`}
                        title={`Faqat ${t.name} mavzusi`}
                        className="inline-flex items-center gap-1 rounded-md ring-1 ring-foreground/10 bg-muted/30 hover:bg-muted hover:ring-foreground/25 px-1.5 py-0.5 text-[11px] text-foreground/85 transition-colors"
                      >
                        <span className="truncate">{t.name}</span>
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

function MetaRow({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        <Icon className="size-3" aria-hidden />
        <span>{label}</span>
      </div>
      <div className="text-[13px]">{children}</div>
    </div>
  );
}
