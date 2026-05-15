import { notFound } from "next/navigation";
import { db } from "@/db";
import { topics, sources, ageCategories } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { getProblemById } from "@/lib/problems/queries";
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
      db.select().from(sources).orderBy(sources.name),
      db
        .select()
        .from(ageCategories)
        .orderBy(ageCategories.sortOrder, ageCategories.name),
    ]);
  if (!p) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Masalani tahrirlash</h1>
      <ProblemForm
        mode="edit"
        problemId={id}
        defaultValues={{
          bodyMd: p.bodyMd,
          solutionMd: p.solutionMd,
          answer: p.answer,
          sourceId: p.sourceId,
          year: p.year,
          problemNumber: p.problemNumber,
          topicIds: p.topics.map((t) => t.id),
          classes: p.classes,
          ageCategoryIds: p.ageCategories.map((a) => a.id),
        }}
        topicsAvailable={topicsAvailable}
        sourcesAvailable={sourcesAvailable}
        ageCategoriesAvailable={ageCategoriesAvailable}
        uploadPrefix={`problems/${id}`}
      />
    </div>
  );
}
