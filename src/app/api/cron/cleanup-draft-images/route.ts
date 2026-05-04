import { NextResponse } from "next/server";
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { verifyCron } from "../_helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DRAFT_PREFIX = "problems/draft/";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Delete R2 objects under `problems/draft/` that are older than 24h.
 *
 * Why this exists: the problem editor (Phase 5) drag-drops images to R2
 * before the problem record is saved, so an admin who closes the tab
 * mid-edit leaves orphans behind. Saved problems have their images moved
 * (well, re-keyed under `problems/{id}/`) when bulk-imported via Phase 8.
 * Single-problem CRUD currently does NOT re-key — so this cron also
 * sweeps once-saved-but-still-under-draft images. That's a known
 * limitation; if it matters, Phase 5 should re-key on save.
 */
export async function GET(request: Request) {
  const unauthorized = verifyCron(request);
  if (unauthorized) return unauthorized;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const Bucket = process.env.R2_BUCKET_NAME;
  if (!accountId || !accessKeyId || !secretAccessKey || !Bucket) {
    return NextResponse.json(
      { ok: false, error: "R2 env not configured" },
      { status: 503 }
    );
  }

  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  const cutoff = Date.now() - MAX_AGE_MS;
  let deleted = 0;
  let scanned = 0;
  let ContinuationToken: string | undefined;

  do {
    const list = await s3.send(
      new ListObjectsV2Command({
        Bucket,
        Prefix: DRAFT_PREFIX,
        ContinuationToken,
      })
    );
    for (const obj of list.Contents ?? []) {
      scanned++;
      if (
        obj.Key &&
        obj.LastModified &&
        obj.LastModified.getTime() < cutoff
      ) {
        await s3.send(new DeleteObjectCommand({ Bucket, Key: obj.Key }));
        deleted++;
      }
    }
    ContinuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (ContinuationToken);

  return NextResponse.json({
    ok: true,
    job: "cleanup-draft-images",
    scanned,
    deleted,
  });
}
