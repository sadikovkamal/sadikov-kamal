"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AgeCategoryEditDialog,
  type AgeCategoryShape,
} from "./age-category-edit-dialog";
import type { AgeCategoryWithCount } from "@/lib/taxonomy/queries";

/**
 * Age-category dashboard. Grid of stat-style cards — distinct from the
 * row-based tables on /admin/topics and /admin/sources so admins
 * immediately register this as a different kind of list (flat, finite,
 * audience-shaped rather than a deep taxonomy). Each card opens the
 * edit dialog; the trailing dashed card is the create CTA.
 */
export function AgeCategoriesList({
  categories,
}: {
  categories: AgeCategoryWithCount[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);

  const editing =
    editingId !== null && editingId !== "new"
      ? categories.find((c) => c.id === editingId)
      : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <p className="text-xs text-muted-foreground tabular-nums">
          {categories.length} ta toifa
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
        {categories.map((c) => (
          <CategoryCard
            key={c.id}
            code={c.code}
            name={c.name}
            problemCount={c.problemCount}
            // Whole-card click navigates to the per-category topics
            // page; the pen icon (a child button) stops propagation
            // and opens the edit modal instead.
            onOpen={() => router.push(`/admin/age-categories/${c.code}`)}
            onEdit={() => setEditingId(c.id)}
          />
        ))}

        {/* Trailing CTA card. Dashed border, plus icon, same footprint
            as data cards so the grid breathes evenly. */}
        <button
          type="button"
          onClick={() => setEditingId("new")}
          className={cn(
            "group relative rounded-xl border border-dashed border-foreground/15",
            "bg-transparent hover:border-foreground/35 hover:bg-muted/40",
            "transition-colors px-4 py-5 flex flex-col items-center justify-center",
            "min-h-[120px] text-muted-foreground hover:text-foreground"
          )}
          aria-label="Yangi yosh toifasi qo'shish"
        >
          <Plus className="size-5 mb-1.5" aria-hidden strokeWidth={1.5} />
          <span className="text-xs font-medium">Yangi toifa</span>
        </button>
      </div>

      {editingId !== null && (
        <AgeCategoryEditDialog
          mode={editingId === "new" ? "create" : "edit"}
          category={editing as AgeCategoryShape | undefined}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}

function CategoryCard({
  code,
  name,
  problemCount,
  onOpen,
  onEdit,
}: {
  code: string;
  name: string;
  problemCount: number;
  onOpen: () => void;
  onEdit: () => void;
}) {
  return (
    // Card is the navigation click target. The pen icon is a nested
    // <button>; pointer/keyboard events on it stopPropagation so
    // editing doesn't double-trigger navigation.
    <div
      role="button"
      tabIndex={0}
      aria-label={`${name} toifasidagi mavzularni ko'rish`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "group relative rounded-xl ring-1 ring-foreground/10 bg-card shadow-sm",
        "hover:ring-foreground/25 hover:shadow-md transition-all cursor-pointer",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand)]",
        "px-4 py-4 min-h-[120px]",
        "flex flex-col justify-between gap-3"
      )}
    >
      {/* Top row: code chip + dedicated edit button */}
      <div className="flex items-start justify-between">
        <code className="font-mono text-[10px] tabular-nums text-muted-foreground/70 leading-none">
          {code}
        </code>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          onKeyDown={(e) => {
            // Enter/Space on the pen must edit, not navigate. The
            // outer div's keyboard handler would otherwise fire too.
            if (e.key === "Enter" || e.key === " ") e.stopPropagation();
          }}
          aria-label={`${name} toifasini tahrirlash`}
          // Always visible but dim until hover/focus, so touch users
          // can see it without hovering and mouse users get a clear
          // affordance the moment they enter the card.
          className={cn(
            "size-6 inline-flex items-center justify-center rounded-md",
            "text-muted-foreground/60 cursor-pointer",
            "hover:bg-muted hover:text-foreground",
            "group-hover:text-muted-foreground",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand)]",
            "transition-colors"
          )}
        >
          <Pencil className="size-3.5" aria-hidden />
        </button>
      </div>

      {/* Name — focal */}
      <div className="text-base font-semibold tracking-tight leading-tight">
        {name}
      </div>

      {/* Bottom: problem count — always shown, even when zero, so the
          card's bottom edge stays visually aligned across the grid. */}
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <BookOpen className="size-3 shrink-0" aria-hidden strokeWidth={1.75} />
        <span>
          Masalalar soni:{" "}
          <span className="tabular-nums font-medium text-foreground/80">
            {problemCount}
          </span>
        </span>
      </div>
    </div>
  );
}
