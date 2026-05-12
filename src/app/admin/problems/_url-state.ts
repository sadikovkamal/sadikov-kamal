import type {
  ProblemListFilters,
  ProblemListSort,
} from "@/lib/problems/queries";

const PAGE_SIZE = 25;

function csv(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function intCsv(value: string | null | undefined): number[] {
  return csv(value)
    .map((n) => Number.parseInt(n, 10))
    .filter((n) => Number.isFinite(n));
}

function parseInt1(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Parse the admin problems list URL state.
 *
 * Convention:
 * - Filters: `q`, `source`, `topic`, `class` are comma-separated lists;
 *   `yearFrom`/`yearTo` are scalars.
 * - Sort: `sortField` ∈ {createdAt, year}; `sortDir` ∈ {asc, desc}.
 * - Pagination: `page` is 1-based.
 *
 * Anything malformed gets dropped silently rather than throwing — a
 * crafted URL shouldn't crash the page.
 */
export function parseSearchParams(sp: URLSearchParams): {
  filters: ProblemListFilters;
  sort: ProblemListSort;
  page: number;
  pageSize: number;
} {
  const filters: ProblemListFilters = {
    search: sp.get("q") ?? undefined,
    sourceIds: csv(sp.get("source")),
    yearFrom: parseInt1(sp.get("yearFrom")),
    yearTo: parseInt1(sp.get("yearTo")),
    classes: intCsv(sp.get("class")),
    topicIds: csv(sp.get("topic")),
  };

  const sortField = sp.get("sortField");
  const sortDir = sp.get("sortDir");
  const sort: ProblemListSort = {
    field: sortField === "year" ? "year" : "createdAt",
    direction: sortDir === "asc" ? "asc" : "desc",
  };

  const page = Math.max(1, parseInt1(sp.get("page")) ?? 1);

  return { filters, sort, page, pageSize: PAGE_SIZE };
}

export { PAGE_SIZE };
