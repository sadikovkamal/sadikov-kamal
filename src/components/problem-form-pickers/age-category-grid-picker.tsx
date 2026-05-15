"use client";

import { BookOpen, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgeCategory } from "@/db/schema";

/**
 * Inline card grid for selecting multiple age categories. Mirrors the
 * /admin/age-categories explorer one-for-one so admins see a familiar
 * shape when picking — same card layout, same code chip, same icon.
 *
 * Why inline (not popover): the set is small (typically ~12) and stable.
 * Showing them up-front avoids an extra click and lets admins scan all
 * options at a glance.
 */
export function AgeCategoryGridPicker({
  available,
  value,
  onChange,
}: {
  available: AgeCategory[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  // Sort by code so the ladder reads 1-sinf → … → 11-sinf → Talaba.
  const sorted = [...available].sort((a, b) => a.code.localeCompare(b.code));

  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2">
      {sorted.map((c) => {
        const isSelected = value.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => toggle(c.id)}
            aria-pressed={isSelected}
            className={cn(
              "group relative rounded-xl ring-1 bg-card shadow-sm text-left",
              "px-3 py-2.5 min-h-[64px] transition-all",
              isSelected
                ? "ring-[var(--accent-brand)] bg-[var(--accent-brand)]/5 shadow-md"
                : "ring-foreground/10 hover:ring-foreground/25 hover:shadow-md"
            )}
          >
            <div className="flex items-start gap-2.5">
              <div
                className={cn(
                  "shrink-0 size-7 rounded-md flex items-center justify-center transition-colors",
                  isSelected
                    ? "bg-[var(--accent-brand)] text-white"
                    : "bg-muted text-muted-foreground"
                )}
                aria-hidden
              >
                {isSelected ? (
                  <Check className="size-4" strokeWidth={2.5} />
                ) : (
                  <BookOpen className="size-3.5" strokeWidth={1.75} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm font-semibold leading-tight truncate",
                    isSelected && "text-[var(--accent-brand-strong)]"
                  )}
                >
                  {c.name}
                </p>
                <code className="font-mono text-[10px] tabular-nums text-muted-foreground/70">
                  {c.code}
                </code>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
