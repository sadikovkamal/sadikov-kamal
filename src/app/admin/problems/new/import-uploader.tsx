"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileArchive,
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
  previewImportAction,
  executeImportAction,
  type PreviewSuccess,
  type ExecuteSuccess,
} from "./_actions";

/**
 * Two-stage import flow:
 *
 *   1. Pick ZIP → click "Tekshirish".
 *   2. Server parses + validates. Modal opens:
 *      - If clean: "Importni boshlash" button + confirm step.
 *      - If broken: per-problem error list. Only "Yopish" — user fixes
 *        the ZIP and retries.
 *   3. After execute: success modal lists the newly-created P####### codes
 *      with a "Masalalar ro'yxatiga o'tish" button.
 */
export function ImportUploader() {
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

  function onPreview() {
    if (!file) return;
    setError(null);
    setPreview(null);
    setSuccess(null);
    startPreview(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await previewImportAction(fd);
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
      const res = await executeImportAction(fd);
      if ("error" in res) {
        setError(res.error);
        setConfirmOpen(false);
      } else {
        setPreview(null);
        setConfirmOpen(false);
        setSuccess(res);
      }
    });
  }

  const validation = preview?.validation ?? null;
  const isClean =
    !!validation &&
    validation.bundleErrors.length === 0 &&
    validation.errorCount === 0 &&
    validation.problems.length > 0;

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        id="zip"
        type="file"
        accept=".zip,application/zip"
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
            <FileArchive
              className="size-4 text-muted-foreground"
              aria-hidden
            />
          </div>
          <div className="flex-1 min-w-0 text-sm">
            <p className="font-medium truncate">{file.name}</p>
            <p className="text-muted-foreground text-xs tabular-nums">
              {(file.size / (1024 * 1024)).toFixed(2)} MB
            </p>
          </div>
          <button
            type="button"
            aria-label="Faylni olib tashlash"
            disabled={isPreviewing || isImporting}
            onClick={reset}
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
          <span className="text-sm font-medium">Arxiv faylni tanlang</span>
          <span className="text-xs text-muted-foreground">.zip</span>
        </button>
      )}

      <Button
        onClick={onPreview}
        disabled={!file || isPreviewing || isImporting}
        className="w-full"
      >
        {isPreviewing ? (
          <>
            <Loader2 data-icon="inline-start" className="animate-spin" />
            Tekshirilmoqda…
          </>
        ) : (
          "Tekshirish"
        )}
      </Button>

      {error && (
        <p className="text-xs text-destructive leading-relaxed">{error}</p>
      )}

      {/* Validation result modal */}
      <Dialog
        open={!!preview}
        onOpenChange={(o) => {
          if (!o) setPreview(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isClean ? (
                <>
                  <CheckCircle2
                    className="size-4 text-emerald-600"
                    aria-hidden
                  />
                  Arxiv tayyor
                </>
              ) : (
                <>
                  <AlertTriangle
                    className="size-4 text-destructive"
                    aria-hidden
                  />
                  Arxivda xatolik bor
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {isClean
                ? `${preview?.parsedSummary.problemCount} ta masala validatsiyadan o'tdi va importga tayyor.`
                : "Quyidagi xatolarni tuzating va arxivni qaytadan yuklang."}
            </DialogDescription>
          </DialogHeader>

          {validation && (
            <ValidationDetails
              validation={validation}
              parsed={preview!.parsedSummary}
            />
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPreview(null)}
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

      {/* Confirm modal */}
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
              {preview?.parsedSummary.problemCount} ta masala bazaga qo&apos;shiladi.
              Bu amalni bekor qilib bo&apos;lmaydi. Davom etamizmi?
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

      {/* Success modal */}
      <Dialog
        open={!!success}
        onOpenChange={(o) => {
          if (!o) reset();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
              {success?.successCount} ta masala qo&apos;shildi
            </DialogTitle>
            <DialogDescription>
              Yangi masala kodlari quyida. Ro&apos;yxatdan ko&apos;rib chiqishingiz mumkin.
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
            <Button variant="outline" onClick={reset}>
              Yana yuklash
            </Button>
            <Button
              nativeButton={false}
              render={
                <Link href="/admin/problems" onClick={() => router.refresh()} />
              }
            >
              Masalalar ro&apos;yxati
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ValidationDetails({
  validation,
  parsed,
}: {
  validation: NonNullable<PreviewSuccess["validation"]>;
  parsed: PreviewSuccess["parsedSummary"];
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <SummaryChip label="Masalalar" value={parsed.problemCount} />
        <SummaryChip label="Rasmlar" value={parsed.imageCount} />
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

      {validation.bundleErrors.length > 0 && (
        <div className="rounded-md ring-1 ring-destructive/30 bg-destructive/5 p-3 text-xs space-y-1">
          <p className="font-medium text-destructive">Arxiv darajasidagi xatolar</p>
          <ul className="list-disc ml-4 text-destructive/90">
            {validation.bundleErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {validation.errorCount > 0 && (
        <div className="space-y-1.5 max-h-64 overflow-auto">
          {validation.problems
            .filter((p) => p.status === "error")
            .map((p) => (
              <div
                key={`${p.index}-${p.sourcePath}`}
                className="rounded-md ring-1 ring-destructive/30 bg-destructive/5 p-2 text-xs"
              >
                <p className="font-mono text-[10px] text-muted-foreground">
                  {p.sourcePath}
                </p>
                <ul className="mt-1 space-y-0.5 text-destructive/90">
                  {p.errors.map((e, i) => (
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
