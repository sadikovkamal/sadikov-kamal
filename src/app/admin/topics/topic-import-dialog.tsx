"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  previewTopicsImportAction,
  executeTopicsImportAction,
  type PreviewSuccess,
  type ExecuteSuccess,
} from "./_import-actions";

/**
 * Three-stage modal: pick → validate → confirm → result. Mirrors the
 * problem ZIP importer at /admin/problems/new but specialized for the
 * topics XLSX schema (no images, no bundle archive).
 */
export function TopicImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewSuccess | null>(null);
  const [success, setSuccess] = useState<ExecuteSuccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPreviewing, startPreview] = useTransition();
  const [isImporting, startImport] = useTransition();

  function reset() {
    setFile(null);
    setPreview(null);
    setSuccess(null);
    setError(null);
    setConfirmOpen(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function closeAll() {
    reset();
    onOpenChange(false);
  }

  function onPreview() {
    if (!file) return;
    setError(null);
    setPreview(null);
    setSuccess(null);
    startPreview(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await previewTopicsImportAction(fd);
      if ("error" in res) {
        setError(res.error);
      } else {
        setPreview(res);
      }
    });
  }

  function onExecute() {
    if (!file) return;
    setError(null);
    startImport(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await executeTopicsImportAction(fd);
      if ("error" in res) {
        setError(res.error);
        setConfirmOpen(false);
      } else {
        setPreview(null);
        setConfirmOpen(false);
        setSuccess(res);
        router.refresh();
      }
    });
  }

  const validation = preview?.validation ?? null;
  const isClean =
    !!validation &&
    validation.bundleErrors.length === 0 &&
    validation.errorCount === 0 &&
    validation.okCount > 0;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o && !isImporting && !isPreviewing) closeAll();
          else onOpenChange(o);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>XLSX dan mavzularni import qilish</DialogTitle>
            <DialogDescription>
              Ustunlar: <code>name</code>, <code>parent_id</code>,{" "}
              <code>description</code>. Root mavzu uchun{" "}
              <code>parent_id = 0</code>; aks holda mavjud{" "}
              <code>T######</code> kodi.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <a
              href="/api/topics-import-template"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              <FileSpreadsheet className="size-3.5" aria-hidden />
              Namuna XLSX yuklab olish
            </a>

            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              disabled={isPreviewing || isImporting}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setSuccess(null);
                setError(null);
              }}
            />

            {file ? (
              <div className="flex items-center gap-2.5 rounded-lg ring-1 ring-foreground/10 bg-card px-3 py-2">
                <div className="rounded-md bg-muted p-1.5 shrink-0">
                  <FileSpreadsheet
                    className="size-4 text-muted-foreground"
                    aria-hidden
                  />
                </div>
                <div className="flex-1 min-w-0 text-sm">
                  <p className="font-medium truncate">{file.name}</p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Faylni olib tashlash"
                  disabled={isPreviewing || isImporting}
                  onClick={() => {
                    setFile(null);
                    setPreview(null);
                    setError(null);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={isPreviewing || isImporting}
                className="w-full flex flex-col items-center justify-center gap-1.5 rounded-lg ring-1 ring-dashed ring-foreground/15 bg-card/40 hover:bg-card hover:ring-foreground/25 transition-colors px-4 py-6 text-center disabled:opacity-50"
              >
                <Upload className="size-4 text-muted-foreground" aria-hidden />
                <span className="text-sm font-medium">Faylni tanlang</span>
                <span className="text-xs text-muted-foreground">.xlsx</span>
              </button>
            )}

            {!validation && (
              <Button
                onClick={onPreview}
                disabled={!file || isPreviewing || isImporting}
                className="w-full"
              >
                {isPreviewing ? (
                  <>
                    <Loader2
                      data-icon="inline-start"
                      className="animate-spin"
                    />
                    Tekshirilmoqda…
                  </>
                ) : (
                  "Tekshirish"
                )}
              </Button>
            )}

            {validation && (
              <ValidationDetails
                validation={validation}
                parsed={preview!.parsedSummary}
              />
            )}

            {error && (
              <p className="text-xs text-destructive leading-relaxed">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeAll}
              disabled={isImporting}
            >
              Yopish
            </Button>
            {isClean && (
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={isImporting}
              >
                Importni boshlash
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm */}
      <Dialog
        open={confirmOpen}
        onOpenChange={(o) => {
          if (!isImporting) setConfirmOpen(o);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Tasdiqlash</DialogTitle>
            <DialogDescription>
              {validation?.okCount} ta mavzu bazaga qo&apos;shiladi. Davom
              etamizmi?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={isImporting}
            >
              Bekor qilish
            </Button>
            <Button onClick={onExecute} disabled={isImporting}>
              {isImporting ? (
                <>
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                  Qo&apos;shilmoqda…
                </>
              ) : (
                "Ha, qo'shamiz"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success */}
      <Dialog
        open={!!success}
        onOpenChange={(o) => {
          if (!o) closeAll();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2
                className="size-4 text-emerald-600"
                aria-hidden
              />
              {success?.successCount} ta mavzu qo&apos;shildi
            </DialogTitle>
            <DialogDescription>
              Yangi mavzu kodlari quyida.
            </DialogDescription>
          </DialogHeader>
          {success && success.createdCodes.length > 0 && (
            <div className="max-h-48 overflow-auto rounded-md ring-1 ring-foreground/10 bg-muted/30 px-3 py-2">
              <div className="flex flex-wrap gap-1.5">
                {success.createdCodes.map((c) => (
                  <code
                    key={c}
                    className="inline-flex items-center rounded bg-card px-1.5 py-0.5 text-[10px] font-mono tabular-nums ring-1 ring-foreground/10"
                  >
                    {c}
                  </code>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => reset()}>
              Yana yuklash
            </Button>
            <Button onClick={closeAll}>Yopish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ValidationDetails({
  validation,
  parsed,
}: {
  validation: NonNullable<PreviewSuccess["validation"]>;
  parsed: PreviewSuccess["parsedSummary"];
}) {
  const isClean =
    validation.bundleErrors.length === 0 && validation.errorCount === 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <SummaryChip label="Jami" value={parsed.rowCount} />
        {validation.okCount > 0 && (
          <SummaryChip
            label="To'g'ri"
            value={validation.okCount}
            tone="success"
          />
        )}
        {validation.errorCount > 0 && (
          <SummaryChip
            label="Xato"
            value={validation.errorCount}
            tone="error"
          />
        )}
      </div>

      {isClean ? (
        <div className="rounded-md ring-1 ring-emerald-500/30 bg-emerald-500/5 p-3 text-xs flex items-center gap-2">
          <CheckCircle2
            className="size-4 text-emerald-600 shrink-0"
            aria-hidden
          />
          <span>Fayl tayyor. {`"Importni boshlash"`} ni bosing.</span>
        </div>
      ) : null}

      {validation.bundleErrors.length > 0 && (
        <div className="rounded-md ring-1 ring-destructive/30 bg-destructive/5 p-3 text-xs space-y-1">
          <p className="font-medium text-destructive flex items-center gap-1.5">
            <AlertTriangle className="size-3.5" aria-hidden />
            Fayl darajasidagi xatolar
          </p>
          <ul className="list-disc ml-4 text-destructive/90">
            {validation.bundleErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {validation.errorCount > 0 && (
        <div className="space-y-1.5 max-h-64 overflow-auto">
          {validation.rows
            .filter((r) => r.status === "error")
            .map((r) => (
              <div
                key={r.excelRow}
                className="rounded-md ring-1 ring-destructive/30 bg-destructive/5 p-2 text-xs"
              >
                <p className="font-mono text-[10px] text-muted-foreground">
                  qator {r.excelRow}
                  {r.name ? ` — ${r.name}` : ""}
                </p>
                <ul className="mt-1 space-y-0.5 text-destructive/90">
                  {r.errors.map((e, i) => (
                    <li key={i}>• {e}</li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function SummaryChip({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "success" | "error";
}) {
  const styles =
    tone === "success"
      ? "ring-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
      : tone === "error"
        ? "ring-destructive/30 bg-destructive/5 text-destructive"
        : "ring-foreground/10 bg-muted/40 text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 ring-1 ${styles}`}
    >
      <span className="font-medium tabular-nums">{value}</span>
      <span>{label}</span>
    </span>
  );
}
