import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { logoutAction } from "./_actions/logout";
import { SidebarShell } from "./sidebar-shell";

const SIDEBAR_COOKIE = "sidebar:collapsed";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();
  const initials = initialsOf(user.fullName);
  const cookieStore = await cookies();
  const initialCollapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "1";

  return (
    <div className="min-h-screen flex bg-background">
      <SidebarShell
        initialCollapsed={initialCollapsed}
        user={{ fullName: user.fullName, email: user.email, initials }}
        logoutAction={logoutAction}
      />

      {/* Content area — fills remaining width, internal max-width per page. */}
      <main className="flex-1 min-w-0 overflow-x-auto">
        <div className="mx-auto w-full max-w-screen-2xl px-6 py-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "A";
}
