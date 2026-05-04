# Phase 4 — R2 Storage Setup

**Goal:** Connect a Cloudflare R2 bucket to the app, build server-side
upload/delete helpers, and verify that uploaded images load from a public URL.
This is the storage layer for problem images and (later) solution PDFs.

**Estimated time:** Half a session (~1.5 hours, plus Cloudflare account setup time)

---

## What you'll have at the end

- A Cloudflare R2 bucket created and configured for public reads
- API tokens scoped to that bucket only
- `lib/storage/r2.ts` with `uploadFile`, `deleteFile`, `getPublicUrl` helpers
- A test upload page (`/admin/_test/upload`) where you can drop a file and
  see it uploaded + previewed

---

## Why R2 (and not Vercel Blob, S3, etc.)

| Option | Cost story | Verdict |
|---|---|---|
| **Cloudflare R2** | $0.015/GB stored, **$0 egress** | Winner — your problem images get viewed many times, R2 doesn't charge per view |
| Vercel Blob | $0.023/GB stored, $0.18/GB egress | More expensive, locked to Vercel |
| AWS S3 | $0.023/GB + $0.09/GB egress | Most expensive at any scale |
| MinIO self-hosted | $0 + VPS cost | Adds operational burden |

For a math platform where the same images get viewed by every visitor over
years, free egress is the differentiator.

R2 is **S3-compatible**, so we use the standard `@aws-sdk/client-s3` package
— same code that would work against AWS, just pointed at Cloudflare's endpoint.

---

## Steps

### 4.1. Create the R2 bucket

1. Sign in at https://dash.cloudflare.com
2. In the sidebar, click **R2** → **Create bucket**
3. Bucket name: `provia-uploads` (must be globally unique within your
   account; namespace is per-account)
4. Location: Automatic
5. Click **Create bucket**

### 4.2. Enable public access

For our use case (problem images displayed in the app), we want public reads
via a URL. Two options:

**Option A — R2.dev subdomain (easiest, dev-friendly):**
1. In the bucket → **Settings** → **Public access** → **Allow Access**
   (under R2.dev subdomain)
2. Cloudflare gives you a URL like `https://pub-xxxxx.r2.dev`
3. Files are accessible at `https://pub-xxxxx.r2.dev/path/to/file.png`

**Option B — Custom domain (production-grade):**
1. Add a custom domain like `assets.yourdomain.com` — needs Cloudflare
   to manage your DNS
2. Better caching, no rate limits

For MVP, use Option A. Migrate to a custom domain in Phase 10.

Save the public URL — you'll need it as `R2_PUBLIC_URL`.

### 4.3. Create an API token

1. R2 → **Manage R2 API Tokens** → **Create API token**
2. Token name: `provia-app`
3. Permissions: **Object Read & Write**
4. Specify bucket: select `provia-uploads` only (not "All buckets" —
   principle of least privilege)
5. TTL: Forever (rotate manually later)
6. Click **Create API Token**
7. Copy:
   - **Access Key ID**
   - **Secret Access Key**
   - **Account ID** (shown at the top of the R2 page)

### 4.4. Update environment variables

Add to `.env.local`:

```env
R2_ACCOUNT_ID=your_account_id_here
R2_ACCESS_KEY_ID=your_access_key_here
R2_SECRET_ACCESS_KEY=your_secret_here
R2_BUCKET_NAME=provia-uploads
R2_PUBLIC_URL=https://pub-xxxxx.r2.dev
```

Update `.env.example` with the same keys (no values).

### 4.5. Install the S3 SDK

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner nanoid
```

`nanoid` is for generating unique storage keys.

### 4.6. R2 client + helpers

Create `src/lib/storage/r2.ts`:

```typescript
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { nanoid } from "nanoid";

const accountId = process.env.R2_ACCOUNT_ID!;
const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;
const bucket = process.env.R2_BUCKET_NAME!;
const publicUrl = process.env.R2_PUBLIC_URL!;

if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
  // Don't throw at import time — env can be missing in build step
  // We throw inside the functions below instead, so the app boots.
  console.warn("R2 environment variables are not fully configured");
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export interface UploadResult {
  storageKey: string;
  publicUrl: string;
  sizeBytes: number;
  mimeType: string;
}

/**
 * Upload a file to R2. Returns the storage key and public URL.
 *
 * @param file - the file body (Uint8Array or Buffer)
 * @param mimeType - validated against an allowlist
 * @param originalFilename - used to derive the extension for the key
 * @param prefix - logical folder, e.g. "problems/{id}" or "batches/{id}"
 */
export async function uploadFile(params: {
  file: Uint8Array;
  mimeType: string;
  originalFilename: string;
  prefix: string;
}): Promise<UploadResult> {
  const { file, mimeType, originalFilename, prefix } = params;

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`File type not allowed: ${mimeType}`);
  }

  if (file.byteLength > MAX_SIZE_BYTES) {
    throw new Error(
      `File too large: ${file.byteLength} bytes (max ${MAX_SIZE_BYTES})`
    );
  }

  const ext = extractExtension(originalFilename, mimeType);
  const id = nanoid(16);
  const storageKey = `${prefix.replace(/^\/|\/$/g, "")}/${id}${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Body: file,
      ContentType: mimeType,
      // Long browser cache, immutable filename means safe to cache forever
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  return {
    storageKey,
    publicUrl: `${publicUrl}/${storageKey}`,
    sizeBytes: file.byteLength,
    mimeType,
  };
}

export async function deleteFile(storageKey: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: storageKey,
    })
  );
}

export async function fileExists(storageKey: string): Promise<boolean> {
  try {
    await s3.send(
      new HeadObjectCommand({ Bucket: bucket, Key: storageKey })
    );
    return true;
  } catch {
    return false;
  }
}

export function getPublicUrl(storageKey: string): string {
  return `${publicUrl}/${storageKey}`;
}

function extractExtension(filename: string, mimeType: string): string {
  // Prefer the original extension if it's safe
  const match = filename.match(/\.[a-zA-Z0-9]{1,8}$/);
  if (match) return match[0].toLowerCase();
  // Fall back to extension from mime type
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
  };
  return map[mimeType] ?? "";
}
```

### 4.7. Upload server action

Create `src/app/admin/_actions/upload-image.ts`:

```typescript
"use server";

import { requireAdmin } from "@/lib/auth";
import { uploadFile } from "@/lib/storage/r2";
import { z } from "zod";

const schema = z.object({
  prefix: z.string().min(1).max(100),
});

export async function uploadImageAction(formData: FormData) {
  await requireAdmin();

  const file = formData.get("file");
  const prefix = formData.get("prefix");

  if (!(file instanceof File)) {
    return { error: "No file provided" };
  }

  const parsed = schema.safeParse({ prefix });
  if (!parsed.success) {
    return { error: "Invalid prefix" };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await uploadFile({
      file: new Uint8Array(arrayBuffer),
      mimeType: file.type,
      originalFilename: file.name,
      prefix: parsed.data.prefix,
    });
    return { success: true, ...result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload failed" };
  }
}
```

### 4.8. Test upload page

Create `src/app/admin/_test/upload/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
      } else if ("success" in result) {
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
          Upload an image to verify the R2 connection.
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
        {isUploading && <p className="text-sm">Uploading...</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div className="space-y-4">
        {files.map((f) => (
          <div key={f.storageKey} className="border rounded-md p-3 space-y-2">
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
```

### 4.9. CORS setup (only needed if uploading from browser directly)

Our flow goes through a server action, so the browser never talks to R2
directly. **No CORS config needed for MVP.**

If you ever switch to direct browser uploads (presigned URLs), set CORS in
the bucket settings.

### 4.10. Add R2 env vars to Vercel

In the Vercel project settings, add:
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_URL`

Otherwise the deployed app can't upload.

### 4.11. Configure Next.js to allow R2 image domain

In `next.config.ts`, add the R2 public hostname so `next/image` can use it:

```typescript
import type { NextConfig } from "next";

const r2PublicUrl = process.env.R2_PUBLIC_URL;
const r2Hostname = r2PublicUrl ? new URL(r2PublicUrl).hostname : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: r2Hostname
      ? [{ protocol: "https", hostname: r2Hostname }]
      : [],
  },
};

export default nextConfig;
```

We use plain `<img>` tags in the markdown renderer (since markdown produces
`<img>` not `<Image>`), but this lets us use `next/image` elsewhere if needed.

---

## File structure changes

```
src/
├── lib/
│   └── storage/
│       └── r2.ts                        (new)
└── app/
    └── admin/
        ├── _actions/
        │   └── upload-image.ts          (new)
        └── _test/
            └── upload/
                └── page.tsx             (new)
next.config.ts                           (modified)
.env.local                               (modified)
.env.example                             (modified)
```

---

## Acceptance criteria

- [ ] R2 bucket created with public access enabled
- [ ] API token has access to **only** that bucket (verify in Cloudflare UI)
- [ ] All R2 env vars set in `.env.local` and Vercel
- [ ] `/admin/_test/upload` loads (after admin login)
- [ ] Uploading a PNG/JPG works, the image is visible in the preview
- [ ] The public URL works in a new browser tab (and in incognito)
- [ ] Uploading a `.txt` file is rejected with "File type not allowed"
- [ ] Uploading a 10MB file is rejected with "File too large"
- [ ] Check the R2 bucket dashboard — uploaded files appear under
      `test/...` prefix
- [ ] Calling `deleteFile()` from a Drizzle Studio one-off query removes
      the file from R2 (optional verification)

---

## Common pitfalls

- **403 Forbidden when fetching public URL** — Public access wasn't enabled.
  Re-check Settings → Public access in the bucket UI.
- **`SignatureDoesNotMatch` error** — Wrong account ID or wrong region.
  Region must be exactly `"auto"` for R2.
- **`NoSuchBucket`** — Bucket name doesn't match the env var. R2 names are
  case-sensitive.
- **Public URL works locally but 404 in production** — `R2_PUBLIC_URL` not
  set in Vercel. Don't use `NEXT_PUBLIC_` prefix here — public URL only
  needs to be known on the server (we generate full URLs server-side and
  ship them to the client).
- **Uploads slow on large files** — `arrayBuffer()` reads the whole file
  into memory. Fine for our 5 MB limit. For larger files, switch to
  multipart uploads (out of scope for MVP).
- **R2.dev URLs rate-limited** — Cloudflare throttles R2.dev for production
  use. Migrate to a custom domain when you start getting real traffic
  (Phase 10).

---

## Cost estimate

- **MVP scale (1000 images, 100 MB total):** $0 — within R2 free tier
  (10 GB storage, 1M Class A operations, 10M Class B operations per month)
- **Year 1 scale (10K images, 5 GB):** ~$0.08/month
- **Year 3 scale (100K images, 50 GB):** ~$0.75/month + zero egress

Compare to S3 with even modest traffic = $5+/month easily.

---

## What's next

→ [Phase 5 — Single Problem CRUD](./phase-05-single-problem-crud.md)
