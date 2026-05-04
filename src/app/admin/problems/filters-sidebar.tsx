"use client";

import { useTransition, useState, type FormEvent } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { Topic, Source, Tag } from "@/db/schema";
import type { ProblemListFilters } from "@/lib/problems/queries";

export interface ProblemFiltersSidebarProps {
  allTopics: Topic[];
  allSources: Source[];
  allTags: Tag[];
  currentFilters: ProblemListFilters;
}

export function ProblemFiltersSidebar({
  allTopics,
  allSources,
  allTags,
  currentFilters,
}: ProblemFiltersSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(currentFilters.search ?? "");

  function pushParams(next: URLSearchParams) {
    // Reset paging on any filter mutation — otherwise you'd land on an
    // empty page 5 because the new filter only has 2 results total.
    next.delete("page");
    const qs = next.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  function setScalar(key: string, value: string | undefined) {
    const next = new URLSearchParams(params.toString());
    if (value && value.length > 0) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    pushParams(next);
  }

  function setCsv(key: string, values: string[]) {
    const next = new URLSearchParams(params.toString());
    if (values.length > 0) {
      next.set(key, values.join(","));
    } else {
      next.delete(key);
    }
    pushParams(next);
  }

  function toggleInArray(key: string, value: string) {
    const current = (params.get(key) ?? "").split(",").filter(Boolean);
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    setCsv(key, next);
  }

  function clearAll() {
    setSearchInput("");
    startTransition(() => router.push(pathname));
  }

  function onSearchSubmit(e: FormEvent) {
    e.preventDefault();
    setScalar("q", searchInput.trim() || undefined);
  }

  const activeCount =
    (currentFilters.search ? 1 : 0) +
    (currentFilters.sourceIds?.length ?? 0) +
    (currentFilters.yearFrom !== undefined ? 1 : 0) +
    (currentFilters.yearTo !== undefined ? 1 : 0) +
    (currentFilters.difficulties?.length ?? 0) +
    (currentFilters.classes?.length ?? 0) +
    (currentFilters.topicIds?.length ?? 0) +
    (currentFilters.tagIds?.length ?? 0);

  return (
    <aside className="space-y-5 text-sm">
      <form onSubmit={onSearchSubmit} className="space-y-1">
        <Label htmlFor="q">Qidiruv</Label>
        <Input
          id="q"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="masala matni…"
          disabled={isPending}
        />
        <p className="text-muted-foreground text-xs">
          Enter bilan qidiring — Postgres FTS ishlatiladi.
        </p>
      </form>

      <div className="space-y-1">
        <Label>Qiyinlik</Label>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((d) => {
            const active = currentFilters.difficulties?.includes(d);
            return (
              <button
                key={d}
                type="button"
                disabled={isPending}
                onClick={() => toggleInArray("difficulty", String(d))}
                className={cn(
                  "h-8 w-8 rounded border text-xs",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted"
                )}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1">
        <Label>Sinflar</Label>
        <div className="grid grid-cols-4 gap-1.5">
          {[5, 6, 7, 8, 9, 10, 11].map((c) => {
            const active = currentFilters.classes?.includes(c);
            return (
              <button
                key={c}
                type="button"
                disabled={isPending}
                onClick={() => toggleInArray("class", String(c))}
                className={cn(
                  "h-7 rounded border text-xs",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted"
                )}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1">
        <Label>Manba</Label>
        <div className="space-y-1 max-h-48 overflow-auto pr-1">
          {allSources.length === 0 && (
            <p className="text-muted-foreground text-xs">Manbalar yo'q</p>
          )}
          {allSources.map((s) => {
            const active = currentFilters.sourceIds?.includes(s.id);
            return (
              <label
                key={s.id}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Checkbox
                  checked={!!active}
                  onCheckedChange={() => toggleInArray("source", s.id)}
                />
                <span className="truncate">{s.name}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="space-y-1">
        <Label>Yil</Label>
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="dan"
            min={1900}
            max={2100}
            defaultValue={currentFilters.yearFrom ?? ""}
            onBlur={(e) => setScalar("yearFrom", e.target.value || undefined)}
          />
          <Input
            type="number"
            placeholder="gacha"
            min={1900}
            max={2100}
            defaultValue={currentFilters.yearTo ?? ""}
            onBlur={(e) => setScalar("yearTo", e.target.value || undefined)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Mavzular</Label>
        <div className="space-y-1 max-h-48 overflow-auto pr-1">
          {allTopics.map((t) => {
            const active = currentFilters.topicIds?.includes(t.id);
            return (
              <label
                key={t.id}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Checkbox
                  checked={!!active}
                  onCheckedChange={() => toggleInArray("topic", t.id)}
                />
                <span className="truncate">{t.name}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="space-y-1">
        <Label>Teglar</Label>
        <div className="space-y-1 max-h-32 overflow-auto pr-1">
          {allTags.length === 0 && (
            <p className="text-muted-foreground text-xs">Teglar yo'q</p>
          )}
          {allTags.map((t) => {
            const active = currentFilters.tagIds?.includes(t.id);
            return (
              <label
                key={t.id}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Checkbox
                  checked={!!active}
                  onCheckedChange={() => toggleInArray("tag", t.id)}
                />
                <span className="truncate">#{t.name}</span>
              </label>
            );
          })}
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={clearAll}
        disabled={isPending || activeCount === 0}
      >
        Filtrlarni tozalash{activeCount > 0 ? ` (${activeCount})` : ""}
      </Button>
    </aside>
  );
}
