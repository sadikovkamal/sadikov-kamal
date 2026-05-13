"use client";

import { useRef, useState, useTransition } from "react";
import { FileArchive, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  previewImportAction,
  executeImportAction,
  type PreviewSuccess,
} from "./_actions";

export function ImportUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewSuccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewing, startPreview] = useTransition();
  const [isImporting, startImport] = useTransition();

  async function onPreview() {
    if (!file) return;
    setError(null);
    setPreview(null);
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
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await executeImportAction(fd);
        // On success, the action calls redirect() which throws NEXT_REDIRECT
        // and never resumes here. If we land here, an error path triggered.
        if (res && "error" in res) {
          setError(res.error);
        }
      } catch (e) {
        // Re-throw redirect markers so Next.js can complete the navigation.
        if (
          e &&
          typeof e === "object" &&
          "digest" in e &&
          typeof (e as { digest: unknown }).digest === "string" &&
          (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
        ) {
          throw e;
        }
        setError(e instanceof Error ? e.message : "Import failed");
      }
    });
  }

  const canImport =
    !!preview &&
    preview.validation.bundleErrors.length === 0 &&
    preview.validation.errorCount === 0 &&
    preview.parsedSummary.problemCount > 0;

  return (
    <div className="space-y-4">
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
          <span className="text-sm font-medium">Arxiv faylni tanlang</span>
          <span className="text-xs text-muted-foreground">.zip</span>
        </button>
      )}

      <div className="flex gap-2">
        <Button
          onClick={onPreview}
          disabled={!file || isPreviewing || isImporting}
        >
          {isPreviewing ? "Qo'shilmoqda…" : "Qo'shish"}
        </Button>
        {canImport && (
          <Button onClick={onExecute} disabled={isImporting || isPreviewing}>
            {isImporting
              ? "Import qilinmoqda…"
              : `${preview!.parsedSummary.problemCount} ta masalani import qilish`}
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {preview && <PreviewReport report={preview} />}
    </div>
  );
}

function PreviewReport({ report }: { report: PreviewSuccess }) {
  const { validation, parsedSummary } = report;
  return (
    <div className="border rounded-md p-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">
          {parsedSummary.problemCount} masala
        </Badge>
        <Badge variant="outline">{parsedSummary.imageCount} rasm</Badge>
        {parsedSummary.manifestPresent && (
          <Badge variant="outline">manifest.yaml</Badge>
        )}
        {validation.okCount > 0 && (
          <Badge variant="default">{validation.okCount} OK</Badge>
        )}
        {validation.warningCount > 0 && (
          <Badge variant="secondary">
            {validation.warningCount} ogohlantirish
          </Badge>
        )}
        {validation.errorCount > 0 && (
          <Badge variant="destructive">{validation.errorCount} xato</Badge>
        )}
      </div>

      {validation.bundleErrors.length > 0 && (
        <div className="text-sm text-destructive">
          <strong>Bundle xatolari:</strong>
          <ul className="list-disc ml-5 mt-1">
            {validation.bundleErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-1.5 max-h-96 overflow-auto">
        {validation.problems.map((p) => {
          const tone =
            p.status === "error"
              ? "border-destructive/50 bg-destructive/5"
              : p.status === "warning"
                ? "border-amber-500/50 bg-amber-500/5"
                : "border-border";
          return (
            <div
              key={`${p.index}-${p.sourcePath}`}
              className={`border rounded p-2 text-xs ${tone}`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant={
                    p.status === "error"
                      ? "destructive"
                      : p.status === "warning"
                        ? "secondary"
                        : "default"
                  }
                >
                  {p.status}
                </Badge>
                <span className="font-mono">{p.sourcePath}</span>
                {p.isDuplicate && (
                  <Badge variant="outline">duplikat (skip)</Badge>
                )}
              </div>
              {p.errors.map((e, i) => (
                <div key={`e-${i}`} className="text-destructive mt-1">
                  • {e}
                </div>
              ))}
              {p.warnings.map((w, i) => (
                <div key={`w-${i}`} className="text-amber-700 dark:text-amber-300 mt-1">
                  • {w}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
