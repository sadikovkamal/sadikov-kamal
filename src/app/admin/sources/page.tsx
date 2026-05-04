import { requireAdmin } from "@/lib/auth";
import { listSourcesWithCounts } from "@/lib/taxonomy/queries";
import { SourcesList } from "./sources-list";

export default async function SourcesPage() {
  await requireAdmin();
  const sources = await listSourcesWithCounts();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Manbalar</h1>
        <p className="text-muted-foreground text-sm">
          Olimpiadalar, kitoblar va kurslar. Slug'lar bulk-import faylidagi
          referenslar uchun ishlatiladi.
        </p>
      </div>
      <SourcesList sources={sources} />
    </div>
  );
}
