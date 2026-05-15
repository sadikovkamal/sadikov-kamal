import { requireAdmin } from "@/lib/auth";
import { listAgeCategoriesWithCounts } from "@/lib/taxonomy/queries";
import { AgeCategoriesList } from "./age-categories-list";
import { PageHeader } from "../_components/page-header";

export default async function AgeCategoriesPage() {
  await requireAdmin();
  const ageCategories = await listAgeCategoriesWithCounts();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Yosh toifalari"
        subtitle="Yosh bo'yicha tasnif. Masala qo'shilganda tanlanadi."
      />
      <AgeCategoriesList ageCategories={ageCategories} />
    </div>
  );
}
