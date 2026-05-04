"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadImageAction } from "@/app/admin/_actions/upload-image";

interface UploadedFile {
  publicUrl: string;
  storageKey: string;
  sizeBytes: number;
}

export default function UploadTestPage() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("prefix", "test");
      const result = await uploadImageAction(formData);

      if ("error" in result && result.error) {
        setError(result.error);
      } else if ("success" in result && result.success) {
        setFiles((prev) => [
          ...prev,
          {
            publicUrl: result.publicUrl,
            storageKey: result.storageKey,
            sizeBytes: result.sizeBytes,
          },
        ]);
      }
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">R2 Upload Test</h1>
        <p className="text-muted-foreground">
          Upload an image to verify the R2 connection. Files land under the
          <code className="mx-1">test/</code> prefix.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="file">Pick an image</Label>
        <Input
          id="file"
          type="file"
          accept="image/*"
          onChange={onChange}
          disabled={isUploading}
        />
        {isUploading && <p className="text-sm">Uploading…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div className="space-y-4">
        {files.map((f) => (
          <div key={f.storageKey} className="border rounded-md p-3 space-y-2">
            {/* Plain <img> — these are user-uploaded R2 URLs, not local assets,
                and we don't want to bring in next/image's loader for the
                test page. Real problem display will use next/image where
                it makes sense. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={f.publicUrl}
              alt=""
              className="max-h-64 rounded border"
            />
            <div className="text-xs font-mono break-all">{f.publicUrl}</div>
            <div className="text-xs text-muted-foreground">
              key: {f.storageKey} · {(f.sizeBytes / 1024).toFixed(1)} KB
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
