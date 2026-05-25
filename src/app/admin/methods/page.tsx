import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { listMethodsWithCounts } from "@/lib/taxonomy/queries";
import { MethodsTree } from "./methods-tree";
import { PageHeader } from "../_components/page-header";

export const metadata: Metadata = {
  title: "Metodlar — Admin",
  description: "Masalalarni yechish metodlari ierarxiyasi.",
};

export default async function MethodsPage() {
  await requireAdmin();
  const methods = await listMethodsWithCounts();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Metodlar"
        subtitle="Masala qanday metod bilan yechilishi (ixtiyoriy)."
      />
      <MethodsTree methods={methods} />
    </div>
  );
}
