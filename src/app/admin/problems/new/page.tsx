import { db } from "@/db";
import { topics, sources } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { ProblemForm } from "@/components/problem-form";

export default async function NewProblemPage() {
  await requireAdmin();
  const [topicsAvailable, sourcesAvailable] = await Promise.all([
    db.select().from(topics).orderBy(topics.name),
    db.select().from(sources).orderBy(sources.name),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Yangi masala</h1>
      <ProblemForm
        mode="create"
        defaultValues={{
          bodyMd: "",
          solutionMd: null,
          answer: null,
          sourceId: sourcesAvailable[0]?.id ?? "",
          year: null,
          problemNumber: null,
          difficulty: 3,
          topicIds: [],
          classes: [],
          tagNames: [],
        }}
        topicsAvailable={topicsAvailable}
        sourcesAvailable={sourcesAvailable}
        uploadPrefix="problems/draft"
      />
    </div>
  );
}
