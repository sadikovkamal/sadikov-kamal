"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TagEditDialog, type TagShape } from "./tag-edit-dialog";
import { TagMergeDialog } from "./tag-merge-dialog";
import type { TagWithCount } from "@/lib/taxonomy/queries";

type SortField = "name" | "usage";
type SortDir = "asc" | "desc";

export function TagsList({ tags }: { tags: TagWithCount[] }) {
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("usage");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const copy = [...tags];
    copy.sort((a, b) => {
      const av = sortField === "name" ? a.name.toLowerCase() : a.usageCount;
      const bv = sortField === "name" ? b.name.toLowerCase() : b.usageCount;
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [tags, sortField, sortDir]);

  function changeSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "usage" ? "desc" : "asc");
    }
  }

  const editingTag =
    editingId !== null && editingId !== "new"
      ? tags.find((t) => t.id === editingId)
      : undefined;

  const mergingTag = mergingId ? tags.find((t) => t.id === mergingId) : null;

  return (
    <div className="space-y-4">
      <Button onClick={() => setEditingId("new")}>+ Yangi teg</Button>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="cursor-pointer"
                onClick={() => changeSort("name")}
              >
                <SortLabel
                  active={sortField === "name"}
                  direction={sortDir}
                >
                  Nomi
                </SortLabel>
              </TableHead>
              <TableHead>Slug</TableHead>
              <TableHead
                className="cursor-pointer"
                onClick={() => changeSort("usage")}
              >
                <SortLabel
                  active={sortField === "usage"}
                  direction={sortDir}
                >
                  Ishlatilgan
                </SortLabel>
              </TableHead>
              <TableHead className="w-48"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center py-8 text-muted-foreground text-sm"
                >
                  Hozircha teglar yo&apos;q.
                </TableCell>
              </TableRow>
            )}
            {sorted.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">#{t.name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {t.slug}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{t.usageCount}</Badge>
                </TableCell>
                <TableCell className="space-x-1 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingId(t.id)}
                  >
                    Tahrirlash
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMergingId(t.id)}
                    disabled={tags.length < 2}
                  >
                    Merge
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editingId !== null && (
        <TagEditDialog
          mode={editingId === "new" ? "create" : "edit"}
          tag={editingTag as TagShape | undefined}
          onClose={() => setEditingId(null)}
        />
      )}

      {mergingTag && (
        <TagMergeDialog
          fromTag={mergingTag}
          allTags={tags}
          onClose={() => setMergingId(null)}
        />
      )}
    </div>
  );
}

function SortLabel({
  children,
  active,
  direction,
}: {
  children: React.ReactNode;
  active: boolean;
  direction: SortDir;
}) {
  if (!active) return <span>{children}</span>;
  const Icon = direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center gap-1 font-medium")}>
      {children}
      <Icon className="size-3" />
    </span>
  );
}
