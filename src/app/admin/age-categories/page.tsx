import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { listAgeCategoriesWithCounts } from "@/lib/taxonomy/queries";
import { AgeCategoriesList } from "./age-categories-list";
import { PageHeader } from "../_components/page-header";

export const metadata: Metadata = {
  title: "Yosh toifasi — Admin",
  description: "Masalalarni auditoriya bo'yicha guruhlash.",
};

export default async function AgeCategoriesPage() {
  await requireAdmin();
  const categories = await listAgeCategoriesWithCounts();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Yosh toifasi"
        subtitle="Masalalarni audiotoriya bo'yicha guruhlash."
      />
      <AgeCategoriesList categories={categories} />
    </div>
  );
}
