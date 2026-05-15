"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarToggleProps {
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
}

export function SidebarToggle({ collapsed, onToggle, className }: SidebarToggleProps) {
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const label = collapsed ? "Sidebar'ni ochish" : "Sidebar'ni yig'ish";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      className={cn(
        "size-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
        className
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
