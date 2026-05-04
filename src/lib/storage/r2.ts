import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
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
        `See phase-04-r2-storage-setup.md for the setup steps.`
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

/** Whitelist of accepted upload MIME types. */
export const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

/** Hard cap. Anything above gets rejected before bytes leave the server. */
export const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

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

export async function fileExists(storageKey: string): Promise<boolean> {
  const { s3, cfg } = getClient();
  try {
    await s3.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: storageKey }));
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
    "image/svg+xml": ".svg",
  };
  return map[mimeType] ?? "";
}
