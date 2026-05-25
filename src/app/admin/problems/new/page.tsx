import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Download, Sparkles } from "lucide-react";
import { db } from "@/db";
import { topics, ageCategories, methods } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { listSourcesWithCounts } from "@/lib/taxonomy/queries";
import { ProblemForm } from "@/components/problem-form";
import { ImportUploader } from "./import-uploader";

export const metadata: Metadata = {
  title: "Yangi masala — Admin",
  description: "Yangi masala yaratish yoki ZIP arxivdan import qilish.",
};

export default async function NewProblemPage() {
  await requireAdmin();
  const [
    topicsAvailable,
    sourcesAvailable,
    ageCategoriesAvailable,
    methodsAvailable,
  ] = await Promise.all([
    db.select().from(topics).orderBy(topics.name),
    // Sources go through the same query the /admin/sources page uses
    // so the picker shows logo URLs already resolved against R2.
    listSourcesWithCounts(),
    db.select().from(ageCategories).orderBy(ageCategories.code),
    db.select().from(methods).orderBy(methods.code),
  ]);

  return (
    <div className="space-y-6">
      <Header />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6">
        <ProblemForm
          mode="create"
          defaultValues={{
            bodyMd: "",
            sourceId: "",
            topicIds: [],
            ageCategoryIds: [],
            methodIds: [],
            image: null,
          }}
          topicsAvailable={topicsAvailable}
          sourcesAvailable={sourcesAvailable}
          ageCategoriesAvailable={ageCategoriesAvailable}
          methodsAvailable={methodsAvailable}
          uploadPrefix="problems/draft"
        />

        <ImportSidebar />
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="space-y-2 pb-5 border-b">
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
        <span className="text-foreground/80">Yangi masala</span>
      </nav>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold tracking-tight">Yangi masala</h1>
      </div>
    </header>
  );
}

/**
 * Right-side helper panel. The two information chunks (uploader, format
 * reference) belong to the same workflow — bulk import — so they live
 * in a single card with an internal divider rather than two separate
 * cards. Sticky on xl breakpoints so the spec stays visible while the
 * writer scrolls through the long form.
 */
function ImportSidebar() {
  return (
    <aside className="xl:sticky xl:top-6 xl:self-start">
      <div className="rounded-xl ring-1 ring-foreground/10 bg-card shadow-sm overflow-hidden">
        {/* Top: eyebrow */}
        <div className="px-5 pt-4 pb-3 flex items-center gap-2 border-b">
          <Sparkles
            className="size-3.5 text-[var(--accent-brand)]"
            aria-hidden
          />
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Tezkor import
          </span>
        </div>

        {/* Body: uploader */}
        <div className="px-5 py-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              {"Bir nechta masalani birdaniga qo'shing"}
            </h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {"ZIP arxivni yuklang, validatsiyadan o'tkazing, so'ng qo'shing."}
            </p>
          </div>
          <ImportUploader />
        </div>

        {/* Divider */}
        <div className="border-t" />

        {/* Format reference */}
        <div className="px-5 py-4 space-y-3 bg-muted/20">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Arxiv tuzilishi
            </span>
            <a
              href="/api/import-template"
              download
              className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--accent-brand-strong)] hover:underline underline-offset-4"
            >
              <Download className="size-3" aria-hidden />
              Template
            </a>
          </div>

          <pre className="rounded-md bg-card ring-1 ring-foreground/10 px-3 py-2.5 text-[11px] leading-relaxed font-mono text-muted-foreground overflow-x-auto">
{`my-batch.zip
├── problems.md     (yoki problems/*.md)
└── images/
    └── rasm.png`}
          </pre>

          <dl className="text-[11px] space-y-2">
            <SpecRow label="Frontmatter">
              source (S######), age_categories (A######), topics (T######)
            </SpecRow>
            <SpecRow label="Sarlavha">
              <code className="font-mono">{`# Shart`}</code>
              {" majburiy"}
            </SpecRow>
            <SpecRow label="Rasm">
              har bir masalada eng ko&apos;pi bilan 1 ta
            </SpecRow>
            <SpecRow label="Cheklovlar">
              50 MB ZIP · 500 ta masala
            </SpecRow>
          </dl>
        </div>
      </div>
    </aside>
  );
}

function SpecRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-2">
      <dt className="text-muted-foreground/70 uppercase tracking-wider text-[10px] pt-0.5">
        {label}
      </dt>
      <dd className="text-muted-foreground leading-relaxed">{children}</dd>
    </div>
  );
}
