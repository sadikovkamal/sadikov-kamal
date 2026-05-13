"use client";

import { useState } from "react";
import { Library, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground tabular-nums">
          {sources.length} ta manba
        </p>
        <Button size="sm" onClick={() => setEditingId("new")}>
          <Plus data-icon="inline-start" />
          Yangi manba
        </Button>
      </div>

      {sources.length === 0 ? (
        <div className="rounded-xl ring-1 ring-foreground/10 bg-card shadow-sm px-6 py-12 text-center space-y-2">
          <Library
            className="size-7 mx-auto text-muted-foreground"
            aria-hidden
            strokeWidth={1.5}
          />
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Manbalar topilmadi</p>
            <p className="text-xs text-muted-foreground">
              {"Olimpiadalar, kitoblar va kurslarni qo'shib boshlang."}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl ring-1 ring-foreground/10 bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr className="border-b">
                  <Th>Nomi</Th>
                  <Th>Slug</Th>
                  <Th>Tur</Th>
                  <Th>Davlat</Th>
                  <Th className="text-right">Masalalar</Th>
                  <Th className="w-24"></Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sources.map((s) => (
                  <tr
                    key={s.id}
                    className="group hover:bg-muted/40 transition-colors"
                  >
                    <td className="px-3 py-2.5 font-medium">{s.name}</td>
                    <td className="px-3 py-2.5">
                      <code className="font-mono text-xs text-muted-foreground">
                        {s.slug}
                      </code>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        variant="secondary"
                        className="text-[10px] font-normal py-0 px-1.5"
                      >
                        {KIND_LABELS[s.kind]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {s.country ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                      {s.problemCount}
                    </td>
                    <td className="px-3 py-2.5 pr-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingId(s.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Pencil data-icon="inline-start" />
                        Tahrirlash
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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

function Th({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`text-left font-medium px-3 py-2 whitespace-nowrap ${className ?? ""}`}
    >
      {children}
    </th>
  );
}
