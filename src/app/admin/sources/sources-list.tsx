"use client";

import { useState } from "react";
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
import { SourceEditDialog, type SourceShape } from "./source-edit-dialog";
import type { SourceWithCount } from "@/lib/taxonomy/queries";

const KIND_LABELS: Record<SourceShape["kind"], string> = {
  olympiad: "Olimpiada",
  book: "Kitob",
  course: "Kurs",
  other: "Boshqa",
};

export function SourcesList({ sources }: { sources: SourceWithCount[] }) {
  const [editingId, setEditingId] = useState<string | "new" | null>(null);

  const editing =
    editingId !== null && editingId !== "new"
      ? sources.find((s) => s.id === editingId)
      : undefined;

  return (
    <div className="space-y-4">
      <Button onClick={() => setEditingId("new")}>+ Yangi manba</Button>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nomi</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Tur</TableHead>
              <TableHead>Davlat</TableHead>
              <TableHead>Masalalar</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center py-8 text-muted-foreground text-sm"
                >
                  Hozircha manbalar yo&apos;q.
                </TableCell>
              </TableRow>
            )}
            {sources.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {s.slug}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{KIND_LABELS[s.kind]}</Badge>
                </TableCell>
                <TableCell className="text-xs">{s.country ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline">{s.problemCount}</Badge>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingId(s.id)}
                  >
                    Tahrirlash
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editingId !== null && (
        <SourceEditDialog
          mode={editingId === "new" ? "create" : "edit"}
          source={editing as SourceShape | undefined}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}
