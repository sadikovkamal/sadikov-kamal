import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { listSourcesWithCounts } from "@/lib/taxonomy/queries";
import { SourcesExplorer } from "./sources-explorer";
import { PageHeader } from "../_components/page-header";

export const metadata: Metadata = {
  title: "Manbalar — Admin",
  description: "Olimpiadalar, kitoblar va kurslar manbalar ro'yxati.",
};

export default async function SourcesPage() {
  await requireAdmin();
  const sources = await listSourcesWithCounts();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Manbalar"
        subtitle="Olimpiadalar, kitoblar va kurslar."
      />
      <SourcesExplorer sources={sources} />
    </div>
  );
}
