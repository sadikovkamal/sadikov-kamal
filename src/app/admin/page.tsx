import { requireAdmin } from "@/lib/auth";

export default async function AdminDashboard() {
  const user = await requireAdmin();
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold">Welcome, {user.fullName}</h1>
      <p className="text-muted-foreground">
        Dashboard coming in Phase 9. For now, this is the admin landing page.
      </p>
    </div>
  );
}
