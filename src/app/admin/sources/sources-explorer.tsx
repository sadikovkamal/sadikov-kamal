"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  Info,
  Library,
  Pencil,
  Plus,
  X,
  ZoomIn,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SourceEditDialog, type SourceShape } from "./source-edit-dialog";
import { SourceLogo } from "./source-logo";
import type { SourceWithCount } from "@/lib/taxonomy/queries";

/**
 * Card-grid explorer for the sources taxonomy. One folder at a time:
 *
 *   /admin/sources                → root sources
 *   /admin/sources?parent=<id>    → children of that parent
 *
 * Each card has three affordances:
 *   - Whole-card click: navigate into a parent, or open the info
 *     dialog for a leaf.
 *   - Info button: open the metadata + description dialog without
 *     navigating.
 *   - Edit pencil: open the edit dialog.
 *   - Logo hover (when a real image is set): zoom-in overlay; click
 *     opens a lightbox at the source resolution.
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
  const [infoId, setInfoId] = useState<string | null>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);

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
  const infoSource = infoId ? byId.get(infoId) ?? null : null;
  const lightboxSource = lightboxId ? byId.get(lightboxId) ?? null : null;
  const parentOfInfo = infoSource?.parentId
    ? byId.get(infoSource.parentId) ?? null
    : null;

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
              onInfo={() => setInfoId(s.id)}
              onZoom={() => setLightboxId(s.id)}
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

      {infoSource && (
        <SourceInfoDialog
          source={infoSource}
          parent={parentOfInfo}
          childCount={childCountById.get(infoSource.id) ?? 0}
          onClose={() => setInfoId(null)}
          onEdit={() => {
            setInfoId(null);
            setEditingId(infoSource.id);
          }}
        />
      )}

      {lightboxSource?.logoPublicUrl && (
        <LogoLightbox
          name={lightboxSource.name}
          url={lightboxSource.logoPublicUrl}
          onClose={() => setLightboxId(null)}
        />
      )}
    </div>
  );
}

/** Width (in px) of the right-side chevron protrusion on parent
 *  cards. Used as both the polygon offset and the inner right
 *  padding so content + icons stay inside the rectangular region. */
const PARENT_ARROW_PX = 28;

function SourceCard({
  source,
  childCount,
  onOpen,
  onEdit,
  onInfo,
  onZoom,
}: {
  source: SourceWithCount;
  childCount: number;
  onOpen: () => void;
  onEdit: () => void;
  onInfo: () => void;
  onZoom: () => void;
}) {
  const hasChildren = childCount > 0;
  const hasLogo = !!source.logoPublicUrl;

  const metaLabel = hasChildren
    ? `${childCount} ta bo'lim`
    : `${source.problemCount} ta masala`;

  // Common content used by both card variants. Pulled out so we can
  // wrap it differently for the parent arrow vs. the leaf rectangle.
  const content = (
    <>
      {/* Whole-card click target. Parents navigate, leaves open info.
          Below the action buttons in DOM order so the buttons stay
          clickable. */}
      <button
        type="button"
        onClick={hasChildren ? onOpen : onInfo}
        className="absolute inset-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand)]"
        aria-label={
          hasChildren
            ? `${source.name}ni ochish`
            : `${source.name} haqida ma'lumot`
        }
      />

      <div
        className="relative flex items-stretch gap-3 p-3 pointer-events-none"
        style={
          // Reserve room on the right for both the arrow notch and
          // the vertical action column (24px wide + a small gap).
          hasChildren ? { paddingRight: PARENT_ARROW_PX + 32 } : undefined
        }
      >
        <div className="relative shrink-0 pointer-events-auto">
          <SourceLogo
            name={source.name}
            publicUrl={source.logoPublicUrl}
            size="md"
          />
          {hasLogo && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onZoom();
              }}
              aria-label={`${source.name} logosini kattalashtirish`}
              className={cn(
                "absolute inset-0 rounded-lg",
                "flex items-center justify-center",
                "bg-foreground/50 text-white opacity-0",
                "hover:opacity-100 focus-visible:opacity-100 transition-opacity",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand)]"
              )}
            >
              <ZoomIn className="size-4" aria-hidden />
            </button>
          )}
        </div>

        <div className="min-w-0 flex-1 flex flex-col justify-center gap-1">
          <p className="font-semibold text-sm truncate leading-tight pr-16">
            {source.name}
          </p>
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
      </div>

      {/* Action cluster — vertically stacked so a single 24px column
          fits comfortably inside the parent arrow's narrow right
          edge (and reads as one tidy group on leaf cards too).
          Vertically centered against the card body. */}
      <div
        className="absolute top-1/2 -translate-y-1/2 z-10 flex flex-col gap-1"
        style={{ right: hasChildren ? PARENT_ARROW_PX + 4 : 8 }}
      >
        <CardIconButton
          onClick={(e) => {
            e.stopPropagation();
            onInfo();
          }}
          icon={<Info className="size-3" aria-hidden />}
          label={`${source.name} haqida ma'lumot`}
        />
        <CardIconButton
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          icon={<Pencil className="size-3" aria-hidden />}
          label={`${source.name}ni tahrirlash`}
        />
      </div>
    </>
  );

  if (hasChildren) {
    // Parent variant — arrow silhouette via clip-path. Outer div is
    // the "border layer" (bg = ring colour); the inner div sits with
    // 1px margin so the outer leaks through along the polygon edge
    // as a hairline border. drop-shadow gives depth (box-shadow +
    // ring would be sliced off along the clip-path edges).
    //
    // The polygon adds 3 vertices per left corner to approximate a
    // ~6px radius quarter-circle, so the rectangle side of the card
    // doesn't feel jaggedly straight against the chevron point. The
    // chevron tip itself stays sharp — adding curve there would
    // dilute the "arrow" affordance.
    const r = 6;
    const a = PARENT_ARROW_PX;
    const mid = (r * 0.3).toFixed(1);
    const clipPath = `polygon(
      ${r}px 0,
      calc(100% - ${a}px) 0,
      100% 50%,
      calc(100% - ${a}px) 100%,
      ${r}px 100%,
      ${mid}px calc(100% - ${mid}px),
      0 calc(100% - ${r}px),
      0 ${r}px,
      ${mid}px ${mid}px
    )`;
    return (
      <div
        className={cn(
          "group relative transition-colors",
          "bg-foreground/15 hover:bg-foreground/30"
        )}
        style={{
          clipPath,
          filter:
            "drop-shadow(0 1px 2px rgba(0,0,0,0.06)) drop-shadow(0 1px 1px rgba(0,0,0,0.04))",
        }}
      >
        <div className="relative bg-card" style={{ clipPath, margin: 1 }}>
          {content}
        </div>
      </div>
    );
  }

  // Leaf variant — classic rounded rectangle.
  return (
    <div
      className={cn(
        "group relative rounded-xl ring-1 ring-foreground/10 bg-card shadow-sm overflow-hidden transition-all",
        "hover:ring-foreground/25 hover:shadow-md"
      )}
    >
      {content}
    </div>
  );
}

function CardIconButton({
  onClick,
  icon,
  label,
}: {
  onClick: (e: React.MouseEvent) => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "size-6 inline-flex items-center justify-center rounded-md",
        "text-muted-foreground bg-card/80 backdrop-blur ring-1 ring-foreground/10",
        "hover:text-foreground hover:bg-card hover:ring-foreground/25 transition-colors"
      )}
    >
      {icon}
    </button>
  );
}

function SourceInfoDialog({
  source,
  parent,
  childCount,
  onClose,
  onEdit,
}: {
  source: SourceWithCount;
  parent: SourceWithCount | null;
  childCount: number;
  onClose: () => void;
  onEdit: () => void;
}) {
  const isLeaf = childCount === 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="truncate">{source.name}</span>
            <code className="font-mono text-xs tabular-nums text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
              {source.code}
            </code>
          </DialogTitle>
          <DialogDescription>
            {isLeaf
              ? `${source.problemCount} ta masala`
              : `${childCount} ta bo'lim`}
            {parent && (
              <>
                {" · "}
                <span>
                  {"Parent: "}
                  {parent.name}
                </span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Logo preview — only when a real image is set. Sourced from
            the same R2 URL the explorer uses; max height keeps tall
            book covers from blowing the dialog out. */}
        {source.logoPublicUrl && (
          <div className="relative w-full h-48 rounded-lg ring-1 ring-foreground/10 bg-muted/40 overflow-hidden">
            <Image
              src={source.logoPublicUrl}
              alt={`${source.name} logosi`}
              fill
              sizes="(max-width: 768px) 100vw, 400px"
              className="object-contain"
            />
          </div>
        )}

        {source.description ? (
          <div className="rounded-lg ring-1 ring-foreground/10 bg-muted/30 px-3 py-2.5">
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
              {source.description}
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            Qo&apos;shimcha ma&apos;lumot kiritilmagan.
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Yopish
          </Button>
          <Button onClick={onEdit}>
            <Pencil data-icon="inline-start" />
            Tahrirlash
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LogoLightbox({
  name,
  url,
  onClose,
}: {
  name: string;
  url: string;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/* Fullscreen viewer — overrides DialogContent's default
          max-w-sm sizing by passing a fresh size set. p-0 and
          rounded-none drop the padding/corners so the image breathes
          edge-to-edge against a dim background. */}
      <DialogContent
        showCloseButton={false}
        className={cn(
          "w-screen h-[100dvh] max-w-none sm:max-w-none",
          "top-0 left-0 translate-x-0 translate-y-0",
          "p-0 gap-0 rounded-none ring-0 bg-foreground/95"
        )}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{name} logosi</DialogTitle>
        </DialogHeader>
        <button
          type="button"
          onClick={onClose}
          aria-label="Yopish"
          className="absolute top-4 right-4 z-10 size-10 inline-flex items-center justify-center rounded-full text-white bg-foreground/40 hover:bg-foreground/60 transition-colors"
        >
          <X className="size-5" />
        </button>
        <div className="relative w-full h-full">
          <Image
            src={url}
            alt={`${name} logosi`}
            fill
            sizes="100vw"
            className="object-contain"
            priority
          />
        </div>
      </DialogContent>
    </Dialog>
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
