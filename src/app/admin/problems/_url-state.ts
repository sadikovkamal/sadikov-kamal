import type {
  ProblemListFilters,
  ProblemListSort,
} from "@/lib/problems/queries";

/**
 * Allowed values for `?pageSize=`. The default (25) is small enough to
 * stay snappy on every device; the cap (200) keeps the server from
 * shipping a giant payload if someone hand-edits the URL.
 */
export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
const DEFAULT_PAGE_SIZE: PageSize = 25;

function csv(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
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
 * - Filters: `q`, `source`, `topic`, `ageCategory` are comma-separated lists.
 * - Sort: `sortField` ∈ {createdAt, code}; `sortDir` ∈ {asc, desc}.
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
    sourceCodes: csv(sp.get("source")),
    ageCategoryCodes: csv(sp.get("ageCategory")),
    topicCodes: csv(sp.get("topic")),
  };

  const sortField = sp.get("sortField");
  const sortDir = sp.get("sortDir");
  const sort: ProblemListSort = {
    field: sortField === "code" ? "code" : "createdAt",
    direction: sortDir === "asc" ? "asc" : "desc",
  };

  const page = Math.max(1, parseInt1(sp.get("page")) ?? 1);

  // pageSize from URL, clamped to the allowed set. Anything malformed
  // (NaN, "999", "abc") falls back to the default — same forgiving
  // pattern as the rest of the parser.
  const rawPageSize = parseInt1(sp.get("pageSize"));
  const pageSize: PageSize =
    rawPageSize !== undefined &&
    (PAGE_SIZE_OPTIONS as readonly number[]).includes(rawPageSize)
      ? (rawPageSize as PageSize)
      : DEFAULT_PAGE_SIZE;

  return { filters, sort, page, pageSize };
}
