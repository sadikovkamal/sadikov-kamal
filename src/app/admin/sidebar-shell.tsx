"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarNav } from "./sidebar-nav";
import { SidebarToggle } from "./sidebar-toggle";

const COOKIE_NAME = "sidebar:collapsed";

interface SidebarShellProps {
  initialCollapsed: boolean;
  user: { fullName: string; email: string; initials: string };
  /** Server action — invoked by form submit; ignores FormData. */
  logoutAction: () => void | Promise<void>;
}

export function SidebarShell({
  initialCollapsed,
  user,
  logoutAction,
}: SidebarShellProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      // ~1 year. samesite=lax is fine — we only read it on same-site navigation.
      document.cookie = `${COOKIE_NAME}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  return (
    <aside
      className={cn(
        "shrink-0 border-r flex flex-col bg-sidebar transition-[width] duration-150 ease-out",
        collapsed ? "w-[56px]" : "w-[220px]"
      )}
      data-collapsed={collapsed || undefined}
    >
      {/* Brand row */}
      <div
        className={cn(
          "h-14 flex items-center border-b",
          collapsed ? "px-2 justify-center" : "px-4 justify-between gap-2"
        )}
      >
        {collapsed ? (
          <Link
            href="/admin"
            aria-label="Provia"
            className="inline-flex items-center justify-center"
          >
            <Image
              src="/brand/logo-mark.svg"
              alt="Provia"
              width={24}
              height={24}
              priority
            />
          </Link>
        ) : (
          <Link href="/admin" aria-label="Provia" className="inline-flex">
            <Image
              src="/brand/logo-wordmark.svg"
              alt="Provia"
              width={104}
              height={26}
              priority
            />
          </Link>
        )}
        {!collapsed && <SidebarToggle collapsed={false} onToggle={toggle} />}
      </div>

      {/* Toggle row when collapsed — sits just below brand */}
      {collapsed && (
        <div className="flex justify-center py-2 border-b">
          <SidebarToggle collapsed={true} onToggle={toggle} />
        </div>
      )}

      <SidebarNav collapsed={collapsed} />

      {/* Account block */}
      <div
        className={cn(
          "border-t p-2",
          collapsed && "flex flex-col items-center gap-1.5"
        )}
      >
        {collapsed ? (
          <>
            <div
              className="size-8 shrink-0 rounded-full bg-[var(--accent-brand)]/15 text-[var(--accent-brand)] flex items-center justify-center text-[11px] font-medium"
              aria-hidden
              title={user.fullName}
            >
              {user.initials}
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                aria-label="Chiqish"
                title="Chiqish"
                className="size-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <LogOut className="size-3.5" aria-hidden />
              </button>
            </form>
          </>
        ) : (
          <div className="flex items-center gap-2 px-2 py-2 rounded-md">
            <div
              className="size-7 shrink-0 rounded-full bg-[var(--accent-brand)]/15 text-[var(--accent-brand)] flex items-center justify-center text-[11px] font-medium"
              aria-hidden
            >
              {user.initials}
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
        )}
      </div>
    </aside>
  );
}
