"use client";

import { useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { FilterPopover, type FilterOption } from "@/app/admin/problems/filters";

/**
 * Yosh toifasi filter at the top of /admin/sources/[code]. Twin of
 * AgeCategorySourceFilter — same FilterPopover, same URL-as-state
 * convention. Picking one or more age categories narrows the topics
 * tree below to (this source × selected ages); empty selection means
 * "every age band counts".
 */
export function SourceAgeCategoryFilter({
  ageCategoriesAvailable,
  selectedAgeCategoryCodes,
}: {
  ageCategoriesAvailable: { id: string; code: string; name: string }[];
  selectedAgeCategoryCodes: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Age categories are flat (no parent/child), so the FilterOption
  // shape is trivially the {id: code, code, name} projection — no
  // id→code mapping needed beyond renaming.
  const options = useMemo<FilterOption[]>(
    () =>
      ageCategoriesAvailable.map((a) => ({
        id: a.code,
        code: a.code,
        name: a.name,
        parentId: null,
      })),
    [ageCategoriesAvailable]
  );

  function push(nextCodes: string[]) {
    const next = new URLSearchParams(params.toString());
    if (nextCodes.length === 0) next.delete("ageCategory");
    else next.set("ageCategory", nextCodes.join(","));
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <FilterPopover
      label="Yosh toifasi"
      icon={<GraduationCap className="size-3.5" aria-hidden />}
      count={selectedAgeCategoryCodes.length}
      options={options}
      selected={selectedAgeCategoryCodes}
      onChange={push}
    />
  );
}
