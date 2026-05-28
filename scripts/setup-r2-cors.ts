// One-time R2 bucket configuration for browser-direct import uploads.
//
// Large problem-import ZIPs are uploaded straight from the browser to R2
// via a presigned PUT (bypassing Vercel's ~4.5 MB server-action body
// cap). For that the bucket must:
//
//   1. CORS — allow cross-origin PUT (and its OPTIONS preflight) from the
//      app origins, otherwise the browser blocks the request.
//   2. Lifecycle — expire objects under `imports/` after 1 day, so ZIPs
//      that were uploaded for preview but never imported are reclaimed
//      automatically (successful imports delete their own staging object).
//
// NOTE on permissions: PutBucketCors / PutBucketLifecycleConfiguration are
// BUCKET-level operations. The app's "Object Read & Write" R2 token likely
// can't run them — it'll get 401/403. That's fine: this script prints the
// exact JSON to paste into the Cloudflare dashboard as a fallback. To run
// it automatically, use an "Admin Read & Write" token instead.
//
// Idempotent: re-running overwrites with the same policy.
//
// Run: npx tsx scripts/setup-r2-cors.ts

import "../src/db/load-env"; // bridges R2_* from .env.local

import {
  S3Client,
  PutBucketCorsCommand,
  PutBucketLifecycleConfigurationCommand,
  type CORSRule,
  type LifecycleRule,
} from "@aws-sdk/client-s3";

/**
 * Origins allowed to PUT directly to R2. Production apex + www, plus the
 * local dev server. Add new deploy domains here and re-run.
 */
const ALLOWED_ORIGINS = [
  "https://sadikov-kamal.uz",
  "https://www.sadikov-kamal.uz",
  "http://localhost:3000",
];

const CORS_RULES: CORSRule[] = [
  {
    AllowedOrigins: ALLOWED_ORIGINS,
    AllowedMethods: ["PUT"],
    AllowedHeaders: ["content-type"],
    MaxAgeSeconds: 3600,
  },
];

const LIFECYCLE_RULES: LifecycleRule[] = [
  {
    ID: "expire-import-staging",
    Status: "Enabled",
    Filter: { Prefix: "imports/" },
    Expiration: { Days: 1 },
  },
];

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(
      `Missing env var: ${name}. Set the R2_* vars in .env.local (or your shell) and re-run.`
    );
    process.exit(1);
  }
  return v;
}

function printDashboardFallback() {
  console.log(
    "\n──────────────────────────────────────────────────────────────"
  );
  console.log("Set these manually in the Cloudflare dashboard instead:");
  console.log("");
  console.log("CORS — Bucket → Settings → CORS Policy → Edit → paste:");
  console.log(JSON.stringify(CORS_RULES, null, 2));
  console.log("");
  console.log(
    "Lifecycle — Bucket → Settings → Object lifecycle rules → Add rule:"
  );
  console.log(`  • Prefix:  imports/`);
  console.log(`  • Action:  Delete objects 1 day after upload`);
  console.log(
    "──────────────────────────────────────────────────────────────"
  );
}

async function main() {
  const accountId = requireEnv("R2_ACCOUNT_ID");
  const accessKeyId = requireEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");
  const bucket = requireEnv("R2_BUCKET_NAME");

  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  try {
    await s3.send(
      new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: { CORSRules: CORS_RULES },
      })
    );
    console.log("✓ CORS set. Allowed PUT origins:");
    for (const o of ALLOWED_ORIGINS) console.log(`    ${o}`);

    await s3.send(
      new PutBucketLifecycleConfigurationCommand({
        Bucket: bucket,
        LifecycleConfiguration: { Rules: LIFECYCLE_RULES },
      })
    );
    console.log("✓ Lifecycle set: objects under imports/ expire after 1 day.");

    console.log(
      `\nR2 bucket "${bucket}" is configured for browser-direct import uploads.`
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`\n✗ Automatic setup failed: ${msg}`);
    console.error(
      "Your R2 token probably lacks bucket-admin permission (the app token is\n" +
        'scoped to objects, not bucket config). Use an "Admin Read & Write" token,\n' +
        "or apply the config in the dashboard:"
    );
    printDashboardFallback();
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("setup-r2-cors FAILED:", e);
  process.exit(1);
});
