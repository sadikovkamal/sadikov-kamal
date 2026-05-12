"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  Library,
  GraduationCap,
  FolderTree,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** When true, prefix-match so `/admin/problems/123` activates Masalalar. */
  prefix?: boolean;
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Kontent",
    items: [
      { href: "/admin/problems", label: "Masalalar", icon: BookOpen, prefix: true },
    ],
  },
  {
    label: "Taksonomiya",
    items: [
      { href: "/admin/topics", label: "Mavzular", icon: FolderTree, prefix: true },
      { href: "/admin/sources", label: "Manbalar", icon: Library, prefix: true },
      {
        href: "/admin/classes",
        label: "Sinflar",
        icon: GraduationCap,
        prefix: true,
      },
    ],
  },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 flex flex-col gap-4 px-2 py-3 overflow-y-auto">
      {SECTIONS.map((section, i) => (
        <div key={i} className="space-y-0.5">
          {section.label && (
            <p className="px-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
              {section.label}
            </p>
          )}
          {section.items.map((item) => {
            const Icon = item.icon;
            const active = item.prefix
              ? pathname === item.href || pathname.startsWith(`${item.href}/`)
              : pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 px-3 h-8 rounded-md text-[13px] transition-colors",
                  active
                    ? "bg-[var(--accent-brand)]/10 text-[var(--accent-brand-strong)] font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    active && "text-[var(--accent-brand)]"
                  )}
                  aria-hidden
                  strokeWidth={active ? 2 : 1.75}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
