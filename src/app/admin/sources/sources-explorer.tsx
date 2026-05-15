"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronRight,
  Library,
  Pencil,
  Plus,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SourceEditDialog, type SourceShape } from "./source-edit-dialog";
import { SourceLogo } from "./source-logo";
import type { SourceWithCount } from "@/lib/taxonomy/queries";

/**
 * Card-grid explorer for the sources taxonomy. One folder at a time:
 *
 *   /admin/sources                → root sources
 *   /admin/sources?parent=<id>    → children of that parent
 *
 * Clicking a card with children navigates into it (URL changes,
 * back/forward in the browser works). The edit button on each card
 * opens the dialog without navigating.
 */
export function SourcesExplorer({
  sources,
}: {
  sources: SourceWithCount[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const parentId = params.get("parent");

  const [editingId, setEditingId] = useState<string | "new" | null>(null);

  // Build quick lookup maps. We only need direct-children-of-parent for
  // the current view, but having both helps the breadcrumb walk up.
  const byId = useMemo(() => {
    const map = new Map<string, SourceWithCount>();
    for (const s of sources) map.set(s.id, s);
    return map;
  }, [sources]);

  const childCountById = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sources) {
      if (s.parentId) {
        map.set(s.parentId, (map.get(s.parentId) ?? 0) + 1);
      }
    }
    return map;
  }, [sources]);

  const current = parentId ? (byId.get(parentId) ?? null) : null;
  const visibleChildren = sources.filter((s) =>
    parentId ? s.parentId === parentId : s.parentId === null
  );

  // Breadcrumb path: walk up from current to the root.
  const breadcrumb = useMemo(() => {
    const chain: SourceWithCount[] = [];
    let node = current;
    while (node) {
      chain.unshift(node);
      node = node.parentId ? (byId.get(node.parentId) ?? null) : null;
    }
    return chain;
  }, [current, byId]);

  function navigateInto(id: string) {
    router.push(`/admin/sources?parent=${id}`);
  }

  const editingSource =
    editingId !== null && editingId !== "new"
      ? sources.find((s) => s.id === editingId)
      : undefined;

  return (
    <div className="space-y-4">
      {/* Breadcrumb (only when inside a parent) */}
      {breadcrumb.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={
              <Link
                href={
                  current?.parentId
                    ? `/admin/sources?parent=${current.parentId}`
                    : "/admin/sources"
                }
              >
                <ArrowLeft data-icon="inline-start" />
                Orqaga
              </Link>
            }
          />
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1 text-xs text-muted-foreground"
          >
            <Link
              href="/admin/sources"
              className="hover:text-foreground transition-colors"
            >
              Manbalar
            </Link>
            {breadcrumb.map((node, i) => {
              const isLast = i === breadcrumb.length - 1;
              return (
                <span key={node.id} className="flex items-center gap-1">
                  <ChevronRight className="size-3" aria-hidden />
                  {isLast ? (
                    <span className="text-foreground/80 font-medium">
                      {node.name}
                    </span>
                  ) : (
                    <Link
                      href={`/admin/sources?parent=${node.id}`}
                      className="hover:text-foreground transition-colors"
                    >
                      {node.name}
                    </Link>
                  )}
                </span>
              );
            })}
          </nav>
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground tabular-nums">
          {visibleChildren.length} ta manba
          {current && (
            <>
              {" "}
              <span className="text-muted-foreground/60">
                · {current.name} ichida
              </span>
            </>
          )}
        </p>
        <Button size="sm" onClick={() => setEditingId("new")}>
          <Plus data-icon="inline-start" />
          Yangi manba
        </Button>
      </div>

      {/* Card grid */}
      {visibleChildren.length === 0 ? (
        <EmptyState insideName={current?.name ?? null} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {visibleChildren.map((s) => (
            <SourceCard
              key={s.id}
              source={s}
              childCount={childCountById.get(s.id) ?? 0}
              onOpen={() => navigateInto(s.id)}
              onEdit={() => setEditingId(s.id)}
            />
          ))}
        </div>
      )}

      {editingId !== null && (
        <SourceEditDialog
          mode={editingId === "new" ? "create" : "edit"}
          source={editingSource as SourceShape | undefined}
          allSources={sources}
          defaultParentId={editingId === "new" ? parentId : null}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}

function SourceCard({
  source,
  childCount,
  onOpen,
  onEdit,
}: {
  source: SourceWithCount;
  childCount: number;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const hasChildren = childCount > 0;

  // Meta line is intentionally short — one count, never both. Showing
  // "0 masala" on a parent (whose problems live in descendants) is
  // misleading, so parents show only their `childCount` and leaves
  // show only their `problemCount`. This also keeps the line out of
  // the truncation zone.
  const metaLabel = hasChildren
    ? `${childCount} ta bo'lim`
    : `${source.problemCount} ta masala`;

  return (
    <div
      className={cn(
        "group relative rounded-xl ring-1 ring-foreground/10 bg-card shadow-sm",
        "hover:ring-foreground/25 hover:shadow-md transition-all"
      )}
    >
      {/* Whole-card click target. Parents open; leaves edit. Sits below
          the edit pill in DOM order so hover-to-edit still works. */}
      <button
        type="button"
        onClick={hasChildren ? onOpen : onEdit}
        className="absolute inset-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand)]"
        aria-label={
          hasChildren
            ? `${source.name}ni ochish`
            : `${source.name}ni tahrirlash`
        }
      />

      <div className="relative flex items-center gap-3 px-4 py-3.5 pointer-events-none">
        <SourceLogo
          name={source.name}
          publicUrl={source.logoPublicUrl}
          size="md"
        />

        <div className="min-w-0 flex-1 flex flex-col gap-1">
          {/* Name row — truncates here, not in the meta line */}
          <p className="font-semibold text-sm truncate leading-tight">
            {source.name}
          </p>

          {/* Meta row: code chip + single count. Chip and count are kept
              short enough to fit even on the narrowest grid breakpoint. */}
          <div className="flex items-center gap-1.5 min-w-0">
            <code
              className={cn(
                "font-mono text-[10px] tabular-nums leading-none",
                "px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground"
              )}
            >
              {source.code}
            </code>
            <span
              className="text-[11px] text-muted-foreground tabular-nums truncate"
              title={metaLabel}
            >
              {metaLabel}
            </span>
          </div>
        </div>

        {/* Chevron — only on parents. Slides on hover so the card
            visibly invites a click into the next level. */}
        {hasChildren && (
          <ChevronRight
            className={cn(
              "size-4 shrink-0 text-muted-foreground/50 transition-all",
              "group-hover:text-foreground/70 group-hover:translate-x-0.5"
            )}
            aria-hidden
          />
        )}
      </div>

      {/* Edit pill — appears on hover. Above the whole-card button. */}
      <button
        type="button"
        onClick={onEdit}
        className={cn(
          "absolute top-2 right-2 z-10 inline-flex items-center gap-1 rounded-md",
          "bg-card/80 backdrop-blur ring-1 ring-foreground/10 px-1.5 py-1",
          "text-[10px] font-medium text-muted-foreground",
          "opacity-0 group-hover:opacity-100 transition-opacity",
          "hover:text-foreground hover:bg-card"
        )}
        aria-label={`${source.name}ni tahrirlash`}
      >
        <Pencil className="size-3" aria-hidden />
        Tahrirlash
      </button>
    </div>
  );
}

function EmptyState({ insideName }: { insideName: string | null }) {
  return (
    <div className="rounded-xl ring-1 ring-foreground/10 bg-card shadow-sm px-6 py-12 text-center space-y-2">
      <Library
        className="size-7 mx-auto text-muted-foreground"
        aria-hidden
        strokeWidth={1.5}
      />
      <div className="space-y-0.5">
        <p className="text-sm font-medium">
          {insideName
            ? `${insideName} ichida hech qanday manba yo'q`
            : "Manbalar topilmadi"}
        </p>
        <p className="text-xs text-muted-foreground">
          {"Yuqoridagi tugma orqali birinchi manbani qo'shing."}
        </p>
      </div>
    </div>
  );
}
