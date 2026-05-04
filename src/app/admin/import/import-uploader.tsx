"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  previewImportAction,
  executeImportAction,
  type PreviewSuccess,
} from "./_actions";

export function ImportUploader() {
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
      <div className="space-y-2">
        <Label htmlFor="zip">Bundle ZIP</Label>
        <Input
          id="zip"
          type="file"
          accept=".zip,application/zip"
          disabled={isPreviewing || isImporting}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
            setError(null);
          }}
        />
        <p className="text-muted-foreground text-xs">
          Format spec: <code>docs/format-spec.md</code>. Bundle limits: 50 MB,
          200 problems, 5 MB per image.
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={onPreview}
          disabled={!file || isPreviewing || isImporting}
        >
          {isPreviewing ? "Tekshirilmoqda…" : "Tekshirish"}
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
