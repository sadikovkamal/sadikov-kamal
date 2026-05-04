import { requireAdmin } from "@/lib/auth";
import { listTagsWithCounts } from "@/lib/taxonomy/queries";
import { TagsList } from "./tags-list";

export default async function TagsPage() {
  await requireAdmin();
  const tags = await listTagsWithCounts();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Teglar</h1>
        <p className="text-muted-foreground text-sm">
          Erkin shakldagi metkalar. Kam ishlatilgan duplikatlarni{" "}
          <strong>Merge</strong> tugmasi orqali boshqasiga birlashtiring.
        </p>
      </div>
      <TagsList tags={tags} />
    </div>
  );
}
