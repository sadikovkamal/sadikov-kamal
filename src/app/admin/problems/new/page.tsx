import Link from "next/link";
import { ChevronRight, Upload, Download, FileText } from "lucide-react";
import { db } from "@/db";
import { topics, sources } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { ProblemForm } from "@/components/problem-form";
import { PageHeader } from "../../_components/page-header";
import { ImportUploader } from "../../import/import-uploader";

export default async function NewProblemPage() {
  await requireAdmin();
  const [topicsAvailable, sourcesAvailable] = await Promise.all([
    db.select().from(topics).orderBy(topics.name),
    db.select().from(sources).orderBy(sources.name),
  ]);

  return (
    <div className="space-y-5">
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
        <span>Yangi masala</span>
      </nav>

      <PageHeader
        title="Yangi masala"
        subtitle="Mavzu va manbani tanlab, masala matnini Markdown va LaTeX bilan yozing."
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
        <ProblemForm
          mode="create"
          defaultValues={{
            bodyMd: "",
            solutionMd: null,
            answer: null,
            sourceId: sourcesAvailable[0]?.id ?? "",
            year: null,
            problemNumber: null,
            topicIds: [],
            classes: [],
            image: null,
          }}
          topicsAvailable={topicsAvailable}
          sourcesAvailable={sourcesAvailable}
          uploadPrefix="problems/draft"
          compact
        />

        <aside className="xl:sticky xl:top-6 xl:self-start">
          <div className="rounded-xl ring-1 ring-foreground/10 bg-card p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-muted p-2 shrink-0">
                <Upload className="size-4 text-muted-foreground" aria-hidden />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold tracking-tight">
                  {"Bir nechta masala qo'shish"}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {"ZIP arxiv orqali bir nechta masalani birdaniga qo'shing."}
                </p>
              </div>
            </div>

            <ImportUploader />
          </div>

          <div className="mt-4 rounded-xl ring-1 ring-foreground/10 bg-card p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-muted p-2 shrink-0">
                <FileText className="size-4 text-muted-foreground" aria-hidden />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold tracking-tight">
                  Arxiv fayl tuzilishi
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {"ZIP arxiv quyidagi tartibda bo'lishi kerak."}
                </p>
              </div>
            </div>

            <pre className="rounded-md bg-muted/60 px-3 py-2.5 text-[11px] leading-relaxed font-mono text-muted-foreground overflow-x-auto">
{`my-batch.zip
├── manifest.yaml   (ixtiyoriy)
├── problems.md     (yoki problems/*.md)
└── images/
    └── rasm.png`}
            </pre>

            <ul className="text-xs text-muted-foreground space-y-1.5">
              <li>
                <span className="text-foreground font-medium">Frontmatter:</span>{" "}
                source, year, problem_number, classes (bitta sinf), topics
              </li>
              <li>
                <span className="text-foreground font-medium">Sarlavha:</span>{" "}
                <code className="font-mono">{`# Shart`}</code>{" "}
                {"majburiy. Yechim import qilinmaydi — admin panelda qo'shiladi."}
              </li>
              <li>
                <span className="text-foreground font-medium">Cheklovlar:</span>{" "}
                50 MB ZIP · 200 ta masala · 5 MB rasm
              </li>
            </ul>

            <a
              href="/api/import-template"
              download
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent-brand-strong)] hover:underline underline-offset-4"
            >
              <Download className="size-3.5" aria-hidden />
              Template yuklash (.zip)
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}
