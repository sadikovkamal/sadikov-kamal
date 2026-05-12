import Link from "next/link";
import Image from "next/image";
import { LogOut } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { logoutAction } from "./_actions/logout";
import { SidebarNav } from "./sidebar-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();
  const initials = initialsOf(user.fullName);

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-[220px] shrink-0 border-r flex flex-col bg-sidebar">
        {/* Brand */}
        <div className="px-4 h-14 flex items-center border-b">
          <Link href="/admin" aria-label="Provia" className="inline-flex">
            <Image
              src="/brand/logo-wordmark.svg"
              alt="Provia"
              width={104}
              height={26}
              priority
            />
          </Link>
        </div>

        <SidebarNav />

        {/* Account block — avatar + name + sign out */}
        <div className="border-t p-2">
          <div className="flex items-center gap-2 px-2 py-2 rounded-md">
            <div
              className="size-7 shrink-0 rounded-full bg-[var(--accent-brand)]/15 text-[var(--accent-brand)] flex items-center justify-center text-[11px] font-medium"
              aria-hidden
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium truncate">{user.fullName}</p>
              <p className="text-[10px] text-muted-foreground truncate">
                {user.email}
              </p>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                aria-label="Chiqish"
                className="size-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <LogOut className="size-3.5" aria-hidden />
              </button>
            </form>
          </div>
        </div>
      </aside>

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
