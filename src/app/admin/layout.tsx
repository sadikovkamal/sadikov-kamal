import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { logoutAction } from "./_actions/logout";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between p-4">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="font-semibold">
              Provia · Admin
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/admin/problems" className="hover:underline">
                Masalalar
              </Link>
              <Link href="/admin/problems/new" className="hover:underline">
                + Yangi
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-sm">
              {user.fullName}
            </span>
            <form action={logoutAction}>
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl p-6">{children}</main>
    </div>
  );
}
