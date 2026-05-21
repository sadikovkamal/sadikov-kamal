"use client";

import { useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Library } from "lucide-react";
import { FilterPopover, type FilterOption } from "@/app/admin/problems/filters";

/**
 * Manba filter at the top of /admin/age-categories/[code]. Reuses the
 * same popover the problems page uses so picker behaviour (tree,
 * search, cascade expand) is identical — admins don't have to learn a
 * second control.
 *
 * State lives in the URL (`?source=S000001,S000002`). The server
 * re-runs listTopicsForAgeCategory on every navigation, so toggling
 * a source rebuilds the tree below from fresh data.
 */
export function AgeCategorySourceFilter({
  sourcesAvailable,
  selectedSourceCodes,
}: {
  sourcesAvailable: {
    id: string;
    code: string;
    name: string;
    parentId: string | null;
  }[];
  selectedSourceCodes: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // FilterPopover keys options by `id`. Here we want the id to BE the
  // code so we read/write codes directly from the URL — no extra
  // id↔code map. parentId is also translated to the parent's code so
  // the popover's cascade still walks the right hierarchy.
  const optionsByCode = useMemo<FilterOption[]>(() => {
    const idToCode = new Map(sourcesAvailable.map((s) => [s.id, s.code]));
    return sourcesAvailable.map((s) => ({
      id: s.code,
      code: s.code,
      name: s.name,
      parentId: s.parentId ? idToCode.get(s.parentId) ?? null : null,
    }));
  }, [sourcesAvailable]);

  function push(nextCodes: string[]) {
    const next = new URLSearchParams(params.toString());
    if (nextCodes.length === 0) next.delete("source");
    else next.set("source", nextCodes.join(","));
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <FilterPopover
      label="Manba"
      icon={<Library className="size-3.5" aria-hidden />}
      count={selectedSourceCodes.length}
      options={optionsByCode}
      selected={selectedSourceCodes}
      onChange={push}
    />
  );
}
