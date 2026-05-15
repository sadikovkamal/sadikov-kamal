"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  CalendarArrowDown,
  CalendarArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Filter,
  Hash,
  Library,
  Search,
  Tags,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import type { ProblemListSort } from "@/lib/problems/queries";

export interface FilterOption {
  id: string;
  code: string;
  name: string;
  /** Parent id for nested taxonomies (sources, topics). null = root. */
  parentId?: string | null;
}

interface FlatNode extends FilterOption {
  depth: number;
  hasChildren: boolean;
}

/**
 * DFS-flatten a nested taxonomy into a list of `{...node, depth}` so the
 * popover can render it as an indented tree without recursion in JSX.
 *
 * Only descends into a parent if its id is in `expanded` — collapsed
 * subtrees stay hidden. `hasChildren` is attached to every node so the
 * row can decide whether to render an expand chevron.
 *
 * Orphans (parentId points to a missing node) surface at depth 0 so
 * they don't silently disappear from the picker.
 */
function flattenTree(
  items: FilterOption[],
  expanded: ReadonlySet<string>
): FlatNode[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const childrenOf = new Map<string | null, FilterOption[]>();
  for (const it of items) {
    const key =
      it.parentId && byId.has(it.parentId) ? it.parentId : null;
    const arr = childrenOf.get(key) ?? [];
    arr.push(it);
    childrenOf.set(key, arr);
  }
  for (const arr of childrenOf.values()) {
    arr.sort((a, b) =>
      (a.code || a.name).localeCompare(b.code || b.name)
    );
  }

  const out: FlatNode[] = [];
  function walk(parentId: string | null, depth: number) {
    const kids = childrenOf.get(parentId) ?? [];
    for (const k of kids) {
      const hasChildren = (childrenOf.get(k.id)?.length ?? 0) > 0;
      out.push({ ...k, depth, hasChildren });
      if (hasChildren && expanded.has(k.id)) {
        walk(k.id, depth + 1);
      }
    }
  }
  walk(null, 0);
  return out;
}

/**
 * Collect the chain of ancestor ids for a node, so search results can
 * pre-expand the tree around any selected match.
 */
function ancestorIds(
  items: FilterOption[],
  id: string
): string[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: string[] = [];
  let cur = byId.get(id);
  while (cur?.parentId) {
    const parent = byId.get(cur.parentId);
    if (!parent) break;
    out.push(parent.id);
    cur = parent;
  }
  return out;
}

/**
 * The full filter bar above the problems list.
 *
 * URL is the source of truth. Each control reads its current value from
 * the URL and pushes a new query string on change — bookmarks and back-
 * navigation work for free.
 *
 *   q             → free-text search
 *   source        → CSV of source UUIDs
 *   ageCategory   → CSV of age category UUIDs
 *   topic         → CSV of topic UUIDs
 *   sortField     → createdAt | code
 *   sortDir       → asc | desc
 */
export function ProblemsFilterBar({
  sourcesAvailable,
  ageCategoriesAvailable,
  topicsAvailable,
  sort,
}: {
  sourcesAvailable: FilterOption[];
  ageCategoriesAvailable: FilterOption[];
  topicsAvailable: FilterOption[];
  sort: ProblemListSort;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const search = params.get("q") ?? "";
  const sourceIds = csv(params.get("source"));
  const ageCategoryIds = csv(params.get("ageCategory"));
  const topicIds = csv(params.get("topic"));

  const activeFilterCount =
    (search ? 1 : 0) +
    sourceIds.length +
    ageCategoryIds.length +
    topicIds.length;

  const sourceById = useMemo(
    () => new Map(sourcesAvailable.map((s) => [s.id, s])),
    [sourcesAvailable]
  );
  const ageById = useMemo(
    () => new Map(ageCategoriesAvailable.map((c) => [c.id, c])),
    [ageCategoriesAvailable]
  );
  const topicById = useMemo(
    () => new Map(topicsAvailable.map((t) => [t.id, t])),
    [topicsAvailable]
  );

  function push(next: URLSearchParams) {
    next.delete("page"); // any filter change resets to page 1
    startTransition(() => {
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  function setCsv(key: string, ids: string[]) {
    const next = new URLSearchParams(params.toString());
    if (ids.length === 0) next.delete(key);
    else next.set(key, ids.join(","));
    push(next);
  }

  function setSort(field: ProblemListSort["field"], direction: "asc" | "desc") {
    const next = new URLSearchParams(params.toString());
    next.set("sortField", field);
    next.set("sortDir", direction);
    push(next);
  }

  function clearAll() {
    const next = new URLSearchParams(params.toString());
    next.delete("q");
    next.delete("source");
    next.delete("ageCategory");
    next.delete("topic");
    push(next);
  }

  return (
    <div className="space-y-2">
      {/* Primary row: search + filter popovers + sort */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox
          initial={search}
          onCommit={(v) => {
            const next = new URLSearchParams(params.toString());
            if (v) next.set("q", v);
            else next.delete("q");
            push(next);
          }}
        />

        <FilterPopover
          label="Manba"
          icon={<Library className="size-3.5" aria-hidden />}
          count={sourceIds.length}
          options={sourcesAvailable}
          selected={sourceIds}
          onChange={(ids) => setCsv("source", ids)}
        />
        <FilterPopover
          label="Yosh toifasi"
          icon={<Hash className="size-3.5" aria-hidden />}
          count={ageCategoryIds.length}
          options={ageCategoriesAvailable}
          selected={ageCategoryIds}
          onChange={(ids) => setCsv("ageCategory", ids)}
        />
        <FilterPopover
          label="Mavzular"
          icon={<Tags className="size-3.5" aria-hidden />}
          count={topicIds.length}
          options={topicsAvailable}
          selected={topicIds}
          onChange={(ids) => setCsv("topic", ids)}
        />

        <div className="ml-auto">
          <SortMenu sort={sort} onChange={setSort} />
        </div>
      </div>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            <Filter className="size-3" aria-hidden />
            Filterlar
          </span>
          {search && (
            <ActiveChip
              label={`"${search}"`}
              onRemove={() => {
                const next = new URLSearchParams(params.toString());
                next.delete("q");
                push(next);
              }}
            />
          )}
          {sourceIds.map((id) => {
            const s = sourceById.get(id);
            if (!s) return null;
            return (
              <ActiveChip
                key={`s-${id}`}
                label={s.name}
                kind="Manba"
                onRemove={() =>
                  setCsv("source", sourceIds.filter((x) => x !== id))
                }
              />
            );
          })}
          {ageCategoryIds.map((id) => {
            const c = ageById.get(id);
            if (!c) return null;
            return (
              <ActiveChip
                key={`a-${id}`}
                label={c.name}
                kind="Yosh"
                onRemove={() =>
                  setCsv(
                    "ageCategory",
                    ageCategoryIds.filter((x) => x !== id)
                  )
                }
              />
            );
          })}
          {topicIds.map((id) => {
            const t = topicById.get(id);
            if (!t) return null;
            return (
              <ActiveChip
                key={`t-${id}`}
                label={t.name}
                kind="Mavzu"
                onRemove={() =>
                  setCsv("topic", topicIds.filter((x) => x !== id))
                }
              />
            );
          })}
          <button
            type="button"
            onClick={clearAll}
            className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 px-1"
          >
            Tozalash
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------- Search ------------------------------------ */

function SearchBox({
  initial,
  onCommit,
}: {
  initial: string;
  onCommit: (v: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onCommit(value.trim());
      }}
      className="relative flex-1 min-w-[200px] max-w-sm"
    >
      <Search
        className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"
        aria-hidden
      />
      <Input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Masala matni bo'yicha qidirish…"
        className="pl-8 pr-8 h-8 text-[13px]"
        aria-label="Masala qidirish"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            setValue("");
            onCommit("");
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 size-4 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
          aria-label="Tozalash"
        >
          <X className="size-3.5" />
        </button>
      )}
    </form>
  );
}

/* -------------------------- Filter popover ---------------------------- */

function FilterPopover({
  label,
  icon,
  count,
  options,
  selected,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  count: number;
  options: FilterOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Default collapsed — only root nodes visible until the admin clicks
  // a chevron. We pre-expand the ancestor chain of every already-
  // selected item so the popover opens with selections in view.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const init = new Set<string>();
    for (const id of selected) {
      for (const a of ancestorIds(options, id)) init.add(a);
    }
    return init;
  });

  // When idle: indented tree honouring `expanded`. When the user types,
  // switch to a flat list of matches — flat search beats partial-tree
  // search at this scale and avoids confusing UX when matches are in
  // collapsed subtrees.
  const visible = useMemo<FlatNode[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return flattenTree(options, expanded);
    return options
      .filter((o) => o.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((o) => ({ ...o, depth: 0, hasChildren: false }));
  }, [options, query, expanded]);

  function toggleSelect(id: string) {
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id]
    );
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpanded(new Set(options.filter((o) => o.parentId !== null).map((o) => o.parentId!)));
  }
  function collapseAll() {
    setExpanded(new Set());
  }
  const hasNesting = options.some((o) => o.parentId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "gap-1.5",
              count > 0 &&
                "ring-1 ring-[var(--accent-brand)]/30 bg-[var(--accent-brand-soft)]/40"
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              {icon}
              {label}
            </span>
            {count > 0 && (
              <span className="inline-flex items-center justify-center min-w-4 h-4 rounded-full bg-[var(--accent-brand)] text-white text-[10px] font-medium tabular-nums px-1">
                {count}
              </span>
            )}
            <ChevronDown className="size-3 opacity-60" aria-hidden />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-72 p-0">
        {options.length > 8 && (
          <div className="relative border-b">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none"
              aria-hidden
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Qidirish…"
              className="w-full bg-transparent pl-8 pr-2 py-2 text-xs outline-none placeholder:text-muted-foreground/60"
              autoFocus
            />
          </div>
        )}
        {hasNesting && !query && (
          <div className="flex items-center justify-end gap-2 border-b px-2 py-1 text-[10px] text-muted-foreground">
            <button
              type="button"
              onClick={expandAll}
              className="hover:text-foreground underline underline-offset-2"
            >
              Hammasini ochish
            </button>
            <span className="text-muted-foreground/40">·</span>
            <button
              type="button"
              onClick={collapseAll}
              className="hover:text-foreground underline underline-offset-2"
            >
              Yopish
            </button>
          </div>
        )}
        <div className="max-h-64 overflow-auto py-1">
          {visible.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              Topilmadi
            </p>
          ) : (
            visible.map((o) => {
              const isSelected = selected.includes(o.id);
              const isExpanded = expanded.has(o.id);
              const indent = 6 + o.depth * 14;
              return (
                <div
                  key={o.id}
                  className={cn(
                    "group/row flex items-center gap-1 pr-2.5 text-sm hover:bg-muted/60 transition-colors",
                    isSelected && "bg-[var(--accent-brand-soft)]/60"
                  )}
                  style={{ paddingLeft: `${indent}px` }}
                >
                  {/* Expand chevron — only for parents in tree mode */}
                  {o.hasChildren ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(o.id);
                      }}
                      className="shrink-0 size-5 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/80"
                      aria-label={isExpanded ? "Yopish" : "Ochish"}
                      aria-expanded={isExpanded}
                    >
                      <ChevronRight
                        className={cn(
                          "size-3.5 transition-transform",
                          isExpanded && "rotate-90"
                        )}
                      />
                    </button>
                  ) : (
                    <span className="shrink-0 size-5" aria-hidden />
                  )}

                  {/* Row body — toggles selection */}
                  <button
                    type="button"
                    onClick={() => toggleSelect(o.id)}
                    className="flex-1 min-w-0 flex items-center gap-2 py-1.5 text-left"
                  >
                    <span
                      className={cn(
                        "shrink-0 size-4 rounded-[4px] border inline-flex items-center justify-center transition-colors",
                        isSelected
                          ? "bg-[var(--accent-brand)] border-[var(--accent-brand)] text-white"
                          : "border-foreground/20"
                      )}
                    >
                      {isSelected && (
                        <Check
                          className="size-3"
                          strokeWidth={2.5}
                          aria-hidden
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{o.name}</span>
                    {o.hasChildren && (
                      <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
                        guruh
                      </span>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
        {selected.length > 0 && (
          <div className="flex items-center justify-between border-t px-2 py-1.5 text-[11px]">
            <span className="text-muted-foreground tabular-nums">
              {selected.length} ta tanlangan
            </span>
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Tozalash
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* -------------------------- Sort menu --------------------------------- */

const SORT_OPTIONS: Array<{
  field: ProblemListSort["field"];
  direction: "asc" | "desc";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    field: "createdAt",
    direction: "desc",
    label: "Yangi qo'shilgan",
    icon: CalendarArrowDown,
  },
  {
    field: "createdAt",
    direction: "asc",
    label: "Eski qo'shilgan",
    icon: CalendarArrowUp,
  },
  { field: "code", direction: "desc", label: "Kod (Z → A)", icon: ArrowDownAZ },
  { field: "code", direction: "asc", label: "Kod (A → Z)", icon: ArrowUpAZ },
];

function SortMenu({
  sort,
  onChange,
}: {
  sort: ProblemListSort;
  onChange: (field: ProblemListSort["field"], dir: "asc" | "desc") => void;
}) {
  const [open, setOpen] = useState(false);
  const current = SORT_OPTIONS.find(
    (o) => o.field === sort.field && o.direction === sort.direction
  );
  const CurrentIcon = current?.icon ?? CalendarArrowDown;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button type="button" variant="outline" size="sm" className="gap-1.5">
            <CurrentIcon className="size-3.5" />
            <span>{current?.label ?? "Tartiblash"}</span>
            <ChevronDown className="size-3 opacity-60" aria-hidden />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-56 p-1">
        {SORT_OPTIONS.map((opt) => {
          const isActive =
            sort.field === opt.field && sort.direction === opt.direction;
          const Icon = opt.icon;
          return (
            <button
              key={`${opt.field}-${opt.direction}`}
              type="button"
              onClick={() => {
                onChange(opt.field, opt.direction);
                setOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left hover:bg-muted/60",
                isActive && "bg-[var(--accent-brand-soft)]/60 font-medium"
              )}
            >
              <Icon className="size-3.5 text-muted-foreground" aria-hidden />
              <span className="flex-1">{opt.label}</span>
              {isActive && (
                <Check
                  className="size-3.5 text-[var(--accent-brand-strong)]"
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

/* -------------------------- Active chip ------------------------------- */

function ActiveChip({
  label,
  kind,
  onRemove,
}: {
  label: string;
  kind?: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full ring-1 ring-foreground/10 bg-card px-2 py-0.5 text-[11px]">
      {kind && (
        <span className="text-muted-foreground/70">{kind}:</span>
      )}
      <span className="font-medium max-w-[160px] truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="size-3.5 inline-flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
        aria-label="Olib tashlash"
      >
        <X className="size-2.5" />
      </button>
    </span>
  );
}

function csv(value: string | null): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}
