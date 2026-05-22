import "server-only";

/**
 * Production environment validation.
 *
 * In production, missing critical env vars should fail loudly at boot
 * rather than surface as cryptic runtime errors deep inside a request
 * handler. This module collects required vars by use case so the error
 * message points at the right setting to add in Vercel.
 *
 * Dev mode is lenient: only DATABASE_URL is required, the rest gate
 * the features that need them (R2 uploads, cron, etc.).
 */

const isProd = process.env.NODE_ENV === "production";
const isVercel = process.env.VERCEL === "1";

interface EnvCheck {
  name: string;
  required: boolean;
  reason: string;
}

const CHECKS: EnvCheck[] = [
  {
    name: "DATABASE_URL",
    required: true,
    reason: "Postgres connection — required for every request",
  },
  {
    name: "R2_ACCOUNT_ID",
    required: isProd,
    reason: "Cloudflare R2 — image uploads + backups",
  },
  {
    name: "R2_ACCESS_KEY_ID",
    required: isProd,
    reason: "Cloudflare R2 — image uploads + backups",
  },
  {
    name: "R2_SECRET_ACCESS_KEY",
    required: isProd,
    reason: "Cloudflare R2 — image uploads + backups",
  },
  {
    name: "R2_BUCKET_NAME",
    required: isProd,
    reason: "Cloudflare R2 — image uploads + backups",
  },
  {
    name: "R2_PUBLIC_URL",
    required: isProd,
    reason: "Cloudflare R2 — public asset URLs",
  },
  {
    name: "CRON_SECRET",
    required: isProd && isVercel,
    reason: "Cron auth — required when Vercel Cron is active",
  },
  {
    name: "SESSION_SECRET",
    required: isProd,
    reason:
      "HMAC key for session cookie signing — generate with `openssl rand -hex 32`",
  },
];

let validated = false;

/**
 * Validate env vars. Call once at server boot. Throws AggregateError-like
 * if anything required is missing — Vercel will surface the message in
 * the function logs and the deploy stays alive but the function errors
 * 503 instead of 500ing with a confusing stack.
 */
export function validateEnv(): void {
  if (validated) return;
  validated = true;

  const missing = CHECKS.filter(
    (c) => c.required && !process.env[c.name]
  );

  if (missing.length === 0) return;

  const lines = [
    "Environment variables missing:",
    ...missing.map((c) => `  • ${c.name} — ${c.reason}`),
    "",
    "Set these in Vercel → Project → Settings → Environment Variables,",
    "then redeploy. For local dev, copy .env.example to .env.local.",
  ];
  throw new Error(lines.join("\n"));
}

/**
 * Cheap predicate for health/diag pages: returns the names of missing
 * required vars without throwing. Empty array = ready.
 */
export function envReadiness(): { ready: boolean; missing: string[] } {
  const missing = CHECKS.filter(
    (c) => c.required && !process.env[c.name]
  ).map((c) => c.name);
  return { ready: missing.length === 0, missing };
}
