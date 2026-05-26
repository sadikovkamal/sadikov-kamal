"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DEFAULT_PRINT_CONFIG,
  type PrintConfig,
  type PrintProblem,
} from "@/lib/print/types";
import {
  generatePrintDocxAction,
  loadProblemsForPrintAction,
} from "./_print-actions";
import { useSelection } from "./_selection-context";
import { ConfigPanel } from "./print-dialog/config-panel";
import { PrintPreview } from "./print-dialog/preview";

/**
 * Top-level shell for the "Chop etish" modal. Owns four pieces of
 * local state:
 *
 *   - `config`      — the PrintConfig the user is tweaking. Reset to
 *                     `DEFAULT_PRINT_CONFIG` on every open (we
 *                     intentionally don't preserve config across opens
 *                     in v1 — keeps the lifecycle obvious).
 *   - `orderedIds`  — the in-dialog order the worksheet will use.
 *                     Snapshotted from `useSelection().selected` on the
 *                     false→true transition only, so reorders survive
 *                     re-renders but pulling the dialog back open
 *                     resets order to current selection.
 *   - `problems`    — three-state union: loading | loaded list | error.
 *   - `partial`     — non-null when the last `generatePrintDocxAction`
 *                     reported failed-image counts; surfaced as a
 *                     non-blocking banner above the footer.
 *
 * The actual `loadProblemsForPrintAction` and `generatePrintDocxAction`
 * server actions are built in parallel by Task 3.1. This component
 * imports their final signatures from the spec.
 */

interface PrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ProblemsState =
  | PrintProblem[]
  | "loading"
  | {
      error: string;
    };

export function PrintDialog({ open, onOpenChange }: PrintDialogProps) {
  const { selected, deselectMany } = useSelection();

  // Local dialog state. Defaults match the design's "open fresh every
  // time" lifecycle — we reset on close, not on open, so the brief
  // moment the close animation is still playing doesn't show empty
  // controls.
  const [config, setConfig] = useState<PrintConfig>(DEFAULT_PRINT_CONFIG);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [problems, setProblems] = useState<ProblemsState>("loading");
  const [isGenerating, startGeneration] = useTransition();
  const [partial, setPartial] = useState<{ failedImages: number } | null>(null);
  const [missingNotice, setMissingNotice] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Track the previous `open` value so we can run reset/snapshot logic
  // exactly on the false → true and true → false transitions. A naive
  // `useEffect(..., [open])` would also fire on the initial mount with
  // `open=false`, which we want to ignore.
  const prevOpenRef = useRef(false);

  // Stable wrappers for the children. `setOrderedIds` already has a
  // stable identity, but the children's prop type is plain `(ids) =>
  // void` so we wrap once for clarity.
  const handleReorder = useCallback((ids: string[]) => {
    setOrderedIds(ids);
  }, []);

  const handleRemove = useCallback(
    (id: string) => {
      // Drop from local order AND from the global selection so the
      // underlying cards un-tick in real time.
      setOrderedIds((ids) => ids.filter((x) => x !== id));
      deselectMany([id]);
    },
    [deselectMany],
  );

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;

    if (!wasOpen && open) {
      // false → true: snapshot current selection into orderedIds and
      // kick off the load.
      const snapshot = [...selected];
      setConfig(DEFAULT_PRINT_CONFIG);
      setOrderedIds(snapshot);
      setProblems("loading");
      setPartial(null);
      setMissingNotice(null);
      setDownloadError(null);

      if (snapshot.length === 0) {
        // Empty selection — nothing to load. Render the empty-state
        // immediately instead of spinning forever.
        // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-shot reset on the false→true transition; no external dependency to subscribe to
        setProblems([]);
        return;
      }

      let cancelled = false;
      (async () => {
        try {
          const res = await loadProblemsForPrintAction(snapshot);
          if (cancelled) return;
          if (!res.ok) {
            setProblems({ error: res.error });
            return;
          }
          const loaded = res.problems;
          // If the server returned fewer rows than we asked for, drop
          // the missing ones from both the dialog's order and the
          // global selection. Show a small inline banner so the user
          // understands why their count changed.
          if (loaded.length < snapshot.length) {
            const present = new Set(loaded.map((p) => p.id));
            const missing = snapshot.filter((id) => !present.has(id));
            if (missing.length > 0) {
              deselectMany(missing);
              setOrderedIds((ids) => ids.filter((id) => present.has(id)));
              setMissingNotice(
                `${missing.length} ta masala topilmadi va olib tashlandi.`,
              );
            }
          }
          setProblems(loaded);
        } catch (e) {
          if (cancelled) return;
          console.error("[PrintDialog] loadProblemsForPrintAction failed", e);
          setProblems({
            error: "Masalalarni yuklashda xatolik. Qaytadan urinib ko'ring.",
          });
        }
      })();

      return () => {
        cancelled = true;
      };
    }

    if (wasOpen && !open) {
      // true → false: drop everything back to defaults. Keeps the next
      // open clean — no leaked config, no stale `problems` array.
      setConfig(DEFAULT_PRINT_CONFIG);
      setOrderedIds([]);
      setProblems("loading");
      setPartial(null);
      setMissingNotice(null);
      setDownloadError(null);
    }
    return undefined;
    // We intentionally don't depend on `selected` — the snapshot is
    // taken once per open. Adding it would re-snapshot mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleDownload() {
    if (orderedIds.length === 0 || isGenerating || problems === "loading") {
      return;
    }
    setDownloadError(null);
    startGeneration(async () => {
      try {
        const res = await generatePrintDocxAction({ orderedIds, config });
        if (!res.ok) {
          setDownloadError(res.error);
          return;
        }
        // Wrap the raw bytes into a Blob. `bytes` is an ArrayBuffer
        // from the server; we copy into a `Uint8Array` view for the
        // Blob constructor to be explicit about the byte layout.
        const blob = new Blob([new Uint8Array(res.bytes)], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = res.filename;
        // Some browsers require the anchor to be in the DOM for the
        // synthetic click to dispatch correctly.
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        // Revoke after a microtask — the click has already started the
        // download, the blob URL is no longer needed.
        queueMicrotask(() => URL.revokeObjectURL(url));

        if (res.partial && res.partial.failedImages > 0) {
          setPartial({ failedImages: res.partial.failedImages });
        } else {
          setPartial(null);
        }
      } catch (e) {
        console.error("[PrintDialog] generatePrintDocxAction failed", e);
        setDownloadError("Hujjat tayyorlashda xatolik. Qaytadan urinib ko'ring.");
      }
    });
  }

  const isLoading = problems === "loading";
  const selectedCount = orderedIds.length;
  const downloadDisabled = selectedCount === 0 || isGenerating || isLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Width / height drive the two-column layout below. `p-0` so
        // the sticky header/footer can paint edge-to-edge; `gap-0`
        // overrides DialogContent's default 1rem grid gap, otherwise a
        // strip of background shows between the header and the body.
        className="sm:max-w-[1100px] h-[85vh] p-0 overflow-hidden gap-0 flex flex-col"
        showCloseButton={false}
      >
        {/* Sticky header */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
          <div className="flex items-baseline gap-2">
            <h2 className="font-heading text-base font-medium">
              Chop etish
            </h2>
            <span className="text-xs text-muted-foreground">
              {selectedCount} ta tanlangan
            </span>
          </div>
        </div>

        {/* Two-column body. Each pane scrolls independently — the left
            via `overflow-y-auto` inside ConfigPanel, the right via the
            preview's own scroll. `min-h-0` is essential so the flex
            child collapses correctly inside `h-[85vh]`. */}
        <div className="grid min-h-0 flex-1 grid-cols-[20rem_1fr]">
          <aside className="min-h-0 overflow-hidden border-r">
            <ConfigPanel
              config={config}
              setConfig={setConfig}
              problems={problems}
              orderedIds={orderedIds}
              setOrderedIds={handleReorder}
              onRemove={handleRemove}
            />
          </aside>
          <section className="min-h-0 overflow-hidden">
            <PrintPreview
              config={config}
              problems={problems}
              orderedIds={orderedIds}
            />
          </section>
        </div>

        {/* Sticky footer with status banners + actions. Banners stack
            above the buttons so they remain visible even when the user
            scrolls the panes above. */}
        <div className="shrink-0 border-t bg-muted/30">
          {missingNotice && (
            <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-900 dark:text-amber-200">
              <span className="inline-flex items-center gap-1.5">
                <AlertTriangle className="size-3" aria-hidden />
                {missingNotice}
              </span>
            </div>
          )}
          {partial && partial.failedImages > 0 && (
            <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-900 dark:text-amber-200">
              <span className="inline-flex items-center gap-1.5">
                <AlertTriangle className="size-3" aria-hidden />
                {partial.failedImages} ta rasm yuklanmadi.
              </span>
            </div>
          )}
          {downloadError && (
            <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-1.5 text-xs text-destructive">
              {downloadError}
            </div>
          )}
          <div className="flex items-center justify-end gap-2 px-4 py-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isGenerating}
            >
              Bekor qilish
            </Button>
            <Button onClick={handleDownload} disabled={downloadDisabled}>
              {isGenerating ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  Tayyorlanmoqda…
                </>
              ) : (
                "Yuklab olish .docx"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
