"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

const CLASS_NUMBERS = [5, 6, 7, 8, 9, 10, 11] as const;

/**
 * URL-state class filter. Reads/writes the `class` search param as
 * comma-separated integers. Matches `parseSearchParams` in the problems list.
 */
export function ClassFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const raw = params.get("class") ?? "";
  const selected = new Set(
    raw
      .split(",")
      .map((s) => Number.parseInt(s, 10))
      .filter((n) => Number.isFinite(n))
  );

  function commit(next: Set<number>) {
    const sp = new URLSearchParams(params.toString());
    if (next.size === 0) sp.delete("class");
    else sp.set("class", [...next].sort((a, b) => a - b).join(","));
    sp.delete("page");
    startTransition(() => {
      const qs = sp.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  function toggle(n: number) {
    const next = new Set(selected);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    commit(next);
  }

  function clear() {
    commit(new Set());
  }

  const label =
    selected.size === 0
      ? "Sinflar"
      : selected.size === 1
        ? `${[...selected][0]}-sinf`
        : `${selected.size} ta sinf`;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-[13px] gap-1.5"
            disabled={isPending}
          >
            <span>{label}</span>
            {selected.size > 0 ? (
              <Badge
                variant="secondary"
                className="ml-0.5 py-0 px-1.5 text-[10px] tabular-nums"
              >
                {selected.size}
              </Badge>
            ) : (
              <ChevronsUpDown className="size-3.5 opacity-50" aria-hidden />
            )}
          </Button>
        }
      />
      <PopoverContent
        align="start"
        className="w-48 gap-1 p-1.5"
      >
        <div className="flex items-center justify-between px-2 pt-1 pb-1">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            Sinf bo&apos;yicha
          </span>
          {selected.size > 0 && (
            <button
              type="button"
              onClick={clear}
              className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
            >
              <X className="size-3" aria-hidden />
              Tozalash
            </button>
          )}
        </div>
        <div className="flex flex-col">
          {CLASS_NUMBERS.map((n) => {
            const isSelected = selected.has(n);
            return (
              <button
                key={n}
                type="button"
                onClick={() => toggle(n)}
                className={cn(
                  "flex items-center justify-between px-2 h-8 rounded-md text-sm hover:bg-muted transition-colors",
                  isSelected && "font-medium"
                )}
              >
                <span className="tabular-nums">{n}-sinf</span>
                <Check
                  className={cn(
                    "size-4 text-[var(--accent-brand)]",
                    !isSelected && "opacity-0"
                  )}
                  aria-hidden
                />
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
