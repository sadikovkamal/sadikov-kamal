"use client";

import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PrintConfig, PrintProblem } from "@/lib/print/types";

/**
 * Ordered, reorderable preview of the problems the user is about to
 * print. The order is **local to the dialog**: rearranging here changes
 * the worksheet's output order but never writes back to the selection
 * context. Removing a row, however, calls into the context via the
 * parent so the underlying cards on `/admin/problems` un-tick in sync.
 *
 * Loading and error states are rendered with skeletons and an error
 * block respectively so the surrounding panel layout doesn't reflow
 * when `problems` resolves.
 */

interface SelectedListProps {
  orderedIds: string[];
  problems: PrintProblem[] | "loading" | { error: string };
  onReorder: (newIds: string[]) => void;
  onRemove: (id: string) => void;
  numberStyle: PrintConfig["numberStyle"];
}

// ---------------------------------------------------------------------------
// Inline markdown → preview-text helper
// ---------------------------------------------------------------------------

/**
 * Bare-minimum markdown → single-line preview text. We only need this
 * for the row preview; the docx generator and HTML preview use the
 * proper AST walker. Math source is left literal (`$x^2$` stays as
 * `$x^2$`) — for a row snippet that is fine.
 */
function stripMd(bodyMd: string, max: number): string {
  let s = bodyMd;
  // Images: replace with literal "[rasm]" placeholder so the snippet
  // still hints that the problem has a figure.
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, "[rasm]");
  // Links: keep visible text, drop URL.
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Headings (leading #), emphasis (* and _), inline code (`).
  s = s.replace(/^#{1,6}\s+/gm, "");
  s = s.replace(/[*_`]+/g, "");
  // Collapse whitespace.
  s = s.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max).trim()}…`;
}

function formatNumber(index: number, style: PrintConfig["numberStyle"]): string {
  const n = index + 1;
  switch (style) {
    case "paren":
      return `${n})`;
    case "masala":
      return `Masala ${n}.`;
    case "dot":
    default:
      return `${n}.`;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SelectedList({
  orderedIds,
  problems,
  onReorder,
  onRemove,
  numberStyle,
}: SelectedListProps) {
  // Loading: render N skeleton rows so the panel doesn't shrink while
  // the server fetch resolves.
  if (problems === "loading") {
    return (
      <ul className="flex flex-col gap-1 px-3 pb-3">
        {orderedIds.map((id) => (
          <li
            key={id}
            className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5"
          >
            <div className="h-3 w-6 animate-pulse rounded bg-muted" />
            <div className="h-3 w-16 animate-pulse rounded bg-muted" />
            <div className="h-3 flex-1 animate-pulse rounded bg-muted" />
          </li>
        ))}
      </ul>
    );
  }

  if (typeof problems === "object" && !Array.isArray(problems)) {
    return (
      <div className="mx-3 mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
        {problems.error}
      </div>
    );
  }

  // Build a Map for O(1) lookup by id.
  const byId = new Map<string, PrintProblem>();
  for (const p of problems) byId.set(p.id, p);

  function moveUp(idx: number) {
    if (idx <= 0 || idx >= orderedIds.length) return;
    const next = [...orderedIds];
    const a = next[idx - 1]!;
    const b = next[idx]!;
    next[idx - 1] = b;
    next[idx] = a;
    onReorder(next);
  }

  function moveDown(idx: number) {
    if (idx < 0 || idx >= orderedIds.length - 1) return;
    const next = [...orderedIds];
    const a = next[idx]!;
    const b = next[idx + 1]!;
    next[idx] = b;
    next[idx + 1] = a;
    onReorder(next);
  }

  if (orderedIds.length === 0) {
    return (
      <p className="px-3 pb-3 text-xs text-muted-foreground">
        Tanlangan masala yo&apos;q.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1 px-3 pb-3">
      {orderedIds.map((id, idx) => {
        const problem = byId.get(id);
        if (!problem) return null;
        const preview = stripMd(problem.bodyMd, 60);
        return (
          <li
            key={id}
            className="group/row flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-1.5 py-1 text-xs"
          >
            <span className="w-9 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
              {formatNumber(idx, numberStyle)}
            </span>
            <span className="shrink-0 rounded bg-muted px-1 py-px font-mono text-[10px] text-muted-foreground">
              {problem.code}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-foreground/80",
                !preview && "italic text-muted-foreground",
              )}
              title={preview}
            >
              {preview || "(bo'sh)"}
            </span>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => moveUp(idx)}
                disabled={idx === 0}
                aria-label="Yuqoriga"
              >
                <ChevronUp className="size-3" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => moveDown(idx)}
                disabled={idx === orderedIds.length - 1}
                aria-label="Pastga"
              >
                <ChevronDown className="size-3" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onRemove(id)}
                aria-label="O'chirish"
              >
                <X className="size-3" aria-hidden />
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
