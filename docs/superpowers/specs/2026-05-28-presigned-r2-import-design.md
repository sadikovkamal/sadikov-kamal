# Large ZIP import via presigned R2 upload — design

**Date:** 2026-05-28

**Scope:** Fix the problem-import flow so it can accept ZIP bundles larger
than ~4.5 MB. Today the client sends the whole ZIP to a Server Action as
`FormData`; on Vercel the platform rejects any request body over **4.5 MB**
with HTTP **413** before our handler ever runs. A real bundle (e.g.
`7 2021-2022 [1-200].zip`, 14 MB) therefore fails with "qayta urinib
ko'ring". The fix is to upload the ZIP **directly from the browser to
Cloudflare R2** via a presigned PUT URL, bypassing Vercel entirely, then
hand the Server Action only a small storage key.

## Root cause

- `previewImportAction` / `executeImportAction` are Server Actions that
  receive the file via `FormData`. The bytes travel through Vercel's
  serverless function request body.
- Vercel caps serverless request bodies at ~4.5 MB on Hobby/Pro tiers.
  This is a hard platform limit — it cannot be raised via
  `experimental.serverActions.bodySizeLimit` (which is currently `"4mb"`).
- 14 MB > 4.5 MB ⇒ 413, surfaced in the console as
  "An unexpected response was received from the server".
- The existing code comment in `_actions.ts` already anticipates the fix:
  *"For very large bundles we'd stage the bytes in R2 between the two
  stages."* And `next.config.ts`: *"bundles larger than this need to be
  … uploaded through a presigned-PUT path instead of a server action."*

## Non-goals

- Multipart / resumable uploads. A single presigned PUT handles objects up
  to 5 GB on R2; our bundles are tens of MB. YAGNI.
- Changing the ZIP format, the parser, the validator, or the executor.
  Those operate on a `Uint8Array` and stay byte-for-byte identical.
- Changing image upload (`uploadImageAction`). Images are capped at 4 MB
  and keep flowing through their Server Action unchanged.
- A general-purpose presigned-upload abstraction. We add exactly the two
  R2 helpers this feature needs.

## New upload flow

```
Before:  Browser ──[14 MB FormData]──▶ previewImportAction  ──✗ 413 (Vercel 4.5 MB)
                   ──[14 MB FormData]──▶ executeImportAction ──✗ 413   (sent twice!)

After:   Browser ──[tiny req]────────▶ createImportUploadUrlAction() ─▶ { uploadUrl, storageKey }
         Browser ──[14 MB PUT]───────▶ R2  (direct, never touches Vercel)
         Browser ──[storageKey]──────▶ previewImportAction(storageKey)  ─▶ download from R2 + validate
         Browser ──[storageKey]──────▶ executeImportAction(storageKey)  ─▶ download from R2 + import + cleanup
```

The file is uploaded **once** and referenced by key for both stages
(today it is re-sent for each stage).

## Components

### 1. R2 helpers — `src/lib/storage/r2.ts`

Two additions, mirroring the existing lazy-client pattern:

```ts
// Presign a PUT so the browser can upload directly to R2.
export async function createPresignedUploadUrl(params: {
  storageKey: string;
  contentType: string;
  expiresIn?: number;       // seconds, default 600 (10 min)
}): Promise<string>;        // the signed URL

// Download an object's full body as bytes (server-side).
export async function downloadFile(storageKey: string): Promise<Uint8Array>;
```

- `createPresignedUploadUrl` uses `getSignedUrl` from
  `@aws-sdk/s3-request-presigner` (already a dependency) with a
  `PutObjectCommand` carrying `ContentType`. Signing `ContentType` means
  the client must send the exact same `Content-Type` header.
- `downloadFile` uses `GetObjectCommand` and collects the body stream into
  a `Uint8Array` (via `transformToByteArray()`).
- A new constant `MAX_IMPORT_BYTES = 50 * 1024 * 1024` (50 MB) guards the
  download: after fetching, if `byteLength > MAX_IMPORT_BYTES`, reject
  before parsing. (The presigned PUT itself can't cheaply enforce a max,
  so we enforce server-side on read.)

### 2. Server Actions — `src/app/admin/problems/new/_actions.ts`

```ts
// New: admin-only, returns a short-lived presigned PUT + the key to use.
export async function createImportUploadUrlAction(): Promise<
  { success: true; uploadUrl: string; storageKey: string } | { error: string }
>;
```

- Generates `storageKey = imports/${nanoid(16)}.zip`.
- Calls `createPresignedUploadUrl({ storageKey, contentType: "application/zip" })`.

`previewImportAction` and `executeImportAction` change signature from
`(formData: FormData)` to `(storageKey: string)`:

- Validate the key shape (`^imports/[A-Za-z0-9_-]+\.zip$`) to stop an
  authenticated admin from pointing the reader at an arbitrary object.
- `const bytes = await downloadFile(storageKey)` replaces
  `new Uint8Array(await file.arrayBuffer())`.
- Everything downstream (`parseBundle`, `validateBundle`, `executeImport`,
  the revalidatePath calls) is unchanged.
- After `executeImportAction` finishes — on the success path **and** on the
  validation-hard-stop path — best-effort `deleteFile(storageKey)` so the
  staging object doesn't linger. (Wrapped in try/catch; a failed delete
  must not fail the import.)
- `previewImportAction` does **not** delete: the same key is reused by
  execute. Orphans from preview-only sessions are swept by the lifecycle
  rule (below).

`PreviewSuccess.size` is currently `file.size`; it becomes `bytes.length`.

### 3. Client — `src/app/admin/problems/new/import-uploader.tsx`

- New state: `storageKey: string | null`, `uploadPct: number | null`.
- `onPreview` becomes: (a) `createImportUploadUrlAction()`, (b) PUT the
  file to `uploadUrl` via **XMLHttpRequest** (so `upload.onprogress`
  drives a percentage — a plain `fetch` can't report upload progress),
  with header `Content-Type: application/zip`, (c) on 2xx, store
  `storageKey` and call `previewImportAction(storageKey)`.
- `onExecute` calls `executeImportAction(storageKey!)` — no re-upload.
- `reset()` clears `storageKey` and `uploadPct`.
- Button label shows `Yuklanmoqda… {pct}%` during the PUT, then
  `Tekshirilmoqda…` during validation.
- A small client-side guard rejects files over 50 MB with a friendly
  message before requesting a URL.

### 4. CSP — `next.config.ts`

The page currently sends `connect-src 'self'`. A browser PUT to
`https://<account>.r2.cloudflarestorage.com` is cross-origin and would be
blocked. Add `https://*.r2.cloudflarestorage.com` to `connect-src`. The
wildcard is safe: presigned URLs are still signature-gated; CSP only
governs *which origins the page may talk to*.

### 5. One-time infra setup — `scripts/setup-r2-cors.ts`

A script the **user runs once** (`npx tsx scripts/setup-r2-cors.ts`) using
the existing R2 credentials. It does two things via the S3 API:

- **`PutBucketCors`** — allow `PUT` (and the preflight `OPTIONS`) from:
  - `https://sadikov-kamal.uz`
  - `https://www.sadikov-kamal.uz`
  - `http://localhost:3000`

  with `AllowedHeaders: ["content-type"]`, `MaxAgeSeconds: 3600`.
- **`PutBucketLifecycleConfiguration`** — expire objects under the
  `imports/` prefix after **1 day**, so ZIPs from preview-only sessions
  (uploaded, never executed) are reclaimed automatically.

The script prints the applied config and is idempotent (re-running
overwrites with the same policy). `docs/r2-setup.md` gets a short section
pointing at it.

## Error handling

| Failure | Behavior |
|---|---|
| R2 not configured | Action throws the existing "R2 storage is not configured…" error; surfaced in the uploader's error line. |
| Presigned PUT fails (CORS missing, network) | XHR rejects; uploader shows "Yuklab bo'lmadi — qayta urinib ko'ring" with the status code. CORS-not-set is the likely first-run cause → message hints to run the setup script. |
| Object > 50 MB | Client guard rejects pre-upload; server `downloadFile` also rejects as defense-in-depth. |
| Bad/forged storageKey | Server key-shape regex rejects before any R2 read. |
| Delete-after-import fails | Logged, ignored — import already succeeded. |

## Testing

- Extend `scripts/import-smoke.ts` (or add one) to exercise the
  server-side path with a key: upload a fixture ZIP to R2 via
  `createPresignedUploadUrl` + a real PUT, then call
  `previewImportAction(key)` / `executeImportAction(key)` and assert the
  same counts the in-memory path produced, plus that the staging object is
  gone after execute. Runs only when R2 env is present (skips otherwise).
- Manual: deploy, run the CORS script, import the real 14 MB ZIP, confirm
  the progress bar advances and the 200 problems land.

## Dev impact

Import now requires R2 to be configured locally (it previously parsed
in-memory with no R2). This is not a practical regression: the existing
`bodySizeLimit: "4mb"` already blocks large imports in `next dev`, and R2
is a one-line `.env.local` addition. Small-bundle dev imports without R2
are the only thing lost, and that path can't handle the real bundles
anyway.
