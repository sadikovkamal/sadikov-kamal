import { requireAdmin } from "@/lib/auth";
import { listSourcesWithCounts } from "@/lib/taxonomy/queries";
import { SourcesList } from "./sources-list";
import { PageHeader } from "../_components/page-header";

export default async function SourcesPage() {
  await requireAdmin();
  const sources = await listSourcesWithCounts();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Manbalar"
        subtitle="Olimpiadalar, kitoblar va kurslar."
      />
      <SourcesList sources={sources} />
    </div>
  );
}
