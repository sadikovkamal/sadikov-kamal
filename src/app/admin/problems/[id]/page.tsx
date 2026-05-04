import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getProblemById } from "@/lib/problems/queries";
import { MarkdownPreview } from "@/components/markdown-preview";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DeleteProblemButton } from "./delete-button";

const DIFFICULTY_LABELS: Record<number, string> = {
  1: "Oson",
  2: "Yengil",
  3: "O'rta",
  4: "Qiyin",
  5: "Juda qiyin",
};

export default async function ProblemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const p = await getProblemById(id);
  if (!p) notFound();

  const titleParts = [
    p.source?.name,
    p.year ? String(p.year) : null,
    p.problemNumber ? `· ${p.problemNumber}` : null,
  ].filter(Boolean);
  const title = titleParts.length > 0 ? titleParts.join(" ") : "Masala";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{title}</h1>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {p.difficulty}/5 · {DIFFICULTY_LABELS[p.difficulty] ?? "?"}
            </Badge>
            {p.classes.map((c) => (
              <Badge key={c} variant="secondary">
                {c}-sinf
              </Badge>
            ))}
            {p.topics.map((t) => (
              <Badge key={t.id}>{t.name}</Badge>
            ))}
            {p.tags.map((t) => (
              <Badge key={t.id} variant="outline">
                #{t.name}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link href={`/admin/problems/${id}/edit`}>Tahrirlash</Link>} />
          <DeleteProblemButton id={id} />
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Shart</h2>
        <div className="border rounded-md p-4">
          <MarkdownPreview source={p.bodyMd} />
        </div>
      </section>

      {p.solutionMd && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Yechim</h2>
          <div className="border rounded-md p-4">
            <MarkdownPreview source={p.solutionMd} />
          </div>
        </section>
      )}

      {p.answer && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Javob</h2>
          <code className="bg-muted px-2 py-1 rounded font-mono text-sm">
            {p.answer}
          </code>
        </section>
      )}
    </div>
  );
}
