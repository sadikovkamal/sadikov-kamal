import { requireAdmin } from "@/lib/auth";
import { listTopicsWithCounts } from "@/lib/taxonomy/queries";
import { TopicsTree } from "./topics-tree";

export default async function TopicsPage() {
  await requireAdmin();
  const topics = await listTopicsWithCounts();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Mavzular</h1>
        <p className="text-muted-foreground text-sm">
          Mavzular ierarxik. Bola mavzular hech narsa meros olmaydi — ular
          faqat ko&apos;rish qulayligi uchun guruhlangan.
        </p>
      </div>
      <TopicsTree topics={topics} />
    </div>
  );
}
