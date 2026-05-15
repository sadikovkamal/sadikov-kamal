/**
 * Next.js instrumentation hook — runs once per server start (cold start
 * on serverless). Fails fast when required env vars are missing so the
 * function logs surface a clear configuration error instead of cryptic
 * `Cannot read property of undefined` deep inside a request handler.
 *
 * Only validates inside the Node.js runtime; edge functions don't see
 * the full env set and validating there would false-positive.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Lazy import keeps the Edge bundle clean and avoids server-only
  // pulling its protective `throw` into instrumentation init.
  const { validateEnv } = await import("./lib/env");
  validateEnv();
}
