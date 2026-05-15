"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AgeCategoryEditDialog,
  type AgeCategoryShape,
} from "./age-category-edit-dialog";
import type { AgeCategoryWithCount } from "@/lib/taxonomy/queries";

export function AgeCategoriesList({
  ageCategories,
}: {
  ageCategories: AgeCategoryWithCount[];
}) {
  const [editingId, setEditingId] = useState<string | "new" | null>(null);

  const editing =
    editingId !== null && editingId !== "new"
      ? ageCategories.find((a) => a.id === editingId)
      : undefined;

  return (
    <div className="space-y-4">
      <Button onClick={() => setEditingId("new")}>+ Yangi yosh toifasi</Button>

      <div className="border rounded-md p-1">
        {ageCategories.length === 0 && (
          <div className="p-8 text-sm text-muted-foreground text-center">
            Hozircha yosh toifalari yo&apos;q. Yuqoridan birinchisini
            qo&apos;shing.
          </div>
        )}
        {ageCategories.map((a) => (
          <div
            key={a.id}
            className="group flex items-center gap-3 py-2 px-3 hover:bg-muted/60 rounded-md transition-colors"
          >
            <Link
              href={`/admin/age-categories/${a.id}`}
              className="flex items-center gap-3 min-w-0 flex-1"
            >
              <span className="font-medium truncate group-hover:text-[var(--accent-brand-strong)] transition-colors">
                {a.name}
              </span>
              <span className="text-xs text-muted-foreground font-mono truncate">
                {a.slug}
              </span>
              <Badge variant="outline" className="ml-auto shrink-0 tabular-nums">
                {a.problemCount}
              </Badge>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditingId(a.id)}
            >
              Tahrirlash
            </Button>
          </div>
        ))}
      </div>

      {editingId !== null && (
        <AgeCategoryEditDialog
          mode={editingId === "new" ? "create" : "edit"}
          ageCategory={editing as AgeCategoryShape | undefined}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}
