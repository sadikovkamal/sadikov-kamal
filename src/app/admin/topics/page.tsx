import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { listTopicsWithCounts } from "@/lib/taxonomy/queries";
import { TopicsTree } from "./topics-tree";
import { PageHeader } from "../_components/page-header";

export const metadata: Metadata = {
  title: "Mavzular — Admin",
  description: "Masalalarning mavzu ierarxiyasi.",
};

export default async function TopicsPage() {
  await requireAdmin();
  const topics = await listTopicsWithCounts();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mavzular"
        subtitle="Ierarxik tasnif."
      />
      <TopicsTree topics={topics} />
    </div>
  );
}
