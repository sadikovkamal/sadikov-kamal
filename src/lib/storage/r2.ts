import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { nanoid } from "nanoid";

/**
 * Lazy-initialized R2 client.
 *
 * Module load must not throw when R2 env vars are missing — the build
 * step on Vercel hits this code without secrets, and we'd rather degrade
 * at call time than crash the whole app boot. So we validate inside
 * functions and cache the client on first successful build.
 */

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
}

let cachedClient: S3Client | null = null;
let cachedConfig: R2Config | null = null;

function loadConfig(): R2Config {
  if (cachedConfig) return cachedConfig;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;

  const missing: string[] = [];
  if (!accountId) missing.push("R2_ACCOUNT_ID");
  if (!accessKeyId) missing.push("R2_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("R2_SECRET_ACCESS_KEY");
  if (!bucket) missing.push("R2_BUCKET_NAME");
  if (!publicUrl) missing.push("R2_PUBLIC_URL");

  if (missing.length > 0) {
    throw new Error(
      `R2 storage is not configured. Missing env vars: ${missing.join(", ")}. ` +
        `See docs/r2-setup.md for the setup steps.`
    );
  }

  // Strip trailing slash from public URL so concatenation is clean.
  const trimmedPublicUrl = publicUrl!.replace(/\/+$/, "");

  cachedConfig = {
    accountId: accountId!,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    bucket: bucket!,
    publicUrl: trimmedPublicUrl,
  };
  return cachedConfig;
}

function getClient(): { s3: S3Client; cfg: R2Config } {
  const cfg = loadConfig();
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: "auto",
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
  }
  return { s3: cachedClient, cfg };
}

/**
 * Whitelist of accepted upload MIME types.
 *
 * SVG is intentionally NOT allowed: browsers render SVG inline from the
 * public R2 URL, and an attacker-supplied SVG can carry <script> /
 * <foreignObject>/event-handler XSS payloads that would run on
 * pub-*.r2.dev (and on any custom domain we later attach). The cost of
 * sanitizing SVGs server-side outweighs the benefit for an admin-only
 * uploader — admins can rasterize diagrams to PNG.
 */
export const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

/**
 * Default per-file cap for ad-hoc uploads (single-image form, markdown
 * editor drag-and-drop). Kept slightly below Vercel's ~4.5 MB
 * server-action body cap so the framework boundary doesn't reject
 * before our handler runs. The bulk-import path passes its own
 * (looser) cap — the ZIP-wide BUNDLE_LIMITS.maxBytes already bounds
 * individual images there.
 */
export const MAX_SIZE_BYTES = 4 * 1024 * 1024; // 4 MB

export interface UploadResult {
  storageKey: string;
  publicUrl: string;
  sizeBytes: number;
  mimeType: string;
}

/**
 * Upload a file to R2.
 *
 * @param params.file              - the file body
 * @param params.mimeType          - validated against ALLOWED_MIME_TYPES
 * @param params.originalFilename  - used to derive the file extension
 * @param params.prefix            - logical folder, e.g. "problems/{id}"
 * @param params.maxBytes          - optional per-file cap (defaults to MAX_SIZE_BYTES)
 */
export async function uploadFile(params: {
  file: Uint8Array;
  mimeType: string;
  originalFilename: string;
  prefix: string;
  maxBytes?: number;
}): Promise<UploadResult> {
  const {
    file,
    mimeType,
    originalFilename,
    prefix,
    maxBytes = MAX_SIZE_BYTES,
  } = params;

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`File type not allowed: ${mimeType}`);
  }

  if (file.byteLength > maxBytes) {
    throw new Error(
      `File too large: ${file.byteLength} bytes (max ${maxBytes})`
    );
  }

  const { s3, cfg } = getClient();
  const ext = extractExtension(originalFilename, mimeType);
  const id = nanoid(16);
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, "");
  const storageKey = `${cleanPrefix}/${id}${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: storageKey,
      Body: file,
      ContentType: mimeType,
      // Long browser cache. Keys are random, so contents are immutable.
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  return {
    storageKey,
    publicUrl: `${cfg.publicUrl}/${storageKey}`,
    sizeBytes: file.byteLength,
    mimeType,
  };
}

export async function deleteFile(storageKey: string): Promise<void> {
  const { s3, cfg } = getClient();
  await s3.send(
    new DeleteObjectCommand({ Bucket: cfg.bucket, Key: storageKey })
  );
}

/**
 * HEAD probe — used by smoke tests and diagnostics. Returns false on any
 * S3 error (404, network, permission); callers care only "is the object
 * there right now from our perspective".
 */
export async function fileExists(storageKey: string): Promise<boolean> {
  const { s3, cfg } = getClient();
  try {
    await s3.send(
      new HeadObjectCommand({ Bucket: cfg.bucket, Key: storageKey })
    );
    return true;
  } catch {
    return false;
  }
}

export function getPublicUrl(storageKey: string): string {
  const cfg = loadConfig();
  return `${cfg.publicUrl}/${storageKey}`;
}

/**
 * Download the raw bytes of an R2 object by storage key.
 *
 * Used by server-side flows that need to embed binary content (e.g. the
 * print/docx generator embedding image bytes). Goes through the S3 client
 * — not the public CDN — so it works for private buckets and avoids an
 * extra HTTP hop. Throws if the key is empty or the object is missing.
 */
export async function getObjectBytes(
  storageKey: string
): Promise<Uint8Array> {
  if (!storageKey || typeof storageKey !== "string") {
    throw new Error("getObjectBytes: storageKey must be a non-empty string");
  }
  const { s3, cfg } = getClient();
  const response = await s3.send(
    new GetObjectCommand({ Bucket: cfg.bucket, Key: storageKey })
  );
  if (!response.Body) {
    throw new Error(`getObjectBytes: empty body for key ${storageKey}`);
  }
  // The modern AWS SDK v3 wraps the Body in a SmithyStream that exposes
  // `transformToByteArray()` — uniform across Node streams and web
  // ReadableStreams.
  return await response.Body.transformToByteArray();
}

/**
 * Cheap probe used by health/diag endpoints: returns the missing env vars
 * (empty array == ready) without throwing.
 */
export function getR2ConfigStatus(): { ready: boolean; missing: string[] } {
  try {
    loadConfig();
    return { ready: true, missing: [] };
  } catch {
    const missing: string[] = [];
    if (!process.env.R2_ACCOUNT_ID) missing.push("R2_ACCOUNT_ID");
    if (!process.env.R2_ACCESS_KEY_ID) missing.push("R2_ACCESS_KEY_ID");
    if (!process.env.R2_SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY");
    if (!process.env.R2_BUCKET_NAME) missing.push("R2_BUCKET_NAME");
    if (!process.env.R2_PUBLIC_URL) missing.push("R2_PUBLIC_URL");
    return { ready: false, missing };
  }
}

function extractExtension(filename: string, mimeType: string): string {
  // Prefer the original extension if it looks safe.
  const match = filename.match(/\.[a-zA-Z0-9]{1,8}$/);
  if (match) return match[0].toLowerCase();
  // Fall back to extension from mime type.
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
  };
  return map[mimeType] ?? "";
}
