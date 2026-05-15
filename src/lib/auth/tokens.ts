import { randomBytes, createHash, createHmac, timingSafeEqual } from "crypto";

/**
 * Generate a new session token.
 * Returns { token, hashedToken }:
 * - token: the raw string we put in the cookie
 * - hashedToken: the SHA-256 hash we store in the DB
 *
 * We hash because if the DB is ever leaked, the raw tokens shouldn't be
 * usable to impersonate users. Same reasoning as not storing plaintext
 * passwords.
 */
export function generateSessionToken(): {
  token: string;
  hashedToken: string;
} {
  const token = randomBytes(32).toString("base64url"); // 256 bits
  const hashedToken = createHash("sha256").update(token).digest("hex");
  return { token, hashedToken };
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

/**
 * Cookie name. In production we use the `__Host-` prefix so the browser
 * enforces:
 *   - Secure flag must be set (HTTPS only)
 *   - Path must be "/"
 *   - No Domain attribute (no subdomain sharing)
 * Together those rule out cookie injection from a same-site weakness on
 * a sibling subdomain. In dev the prefix would block the cookie entirely
 * (HTTP, no Secure), so we keep the simple name there.
 */
export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-sadikov_kamal_session"
    : "sadikov_kamal_session";

/**
 * Cookie integrity (HMAC-SHA256) layer.
 *
 * The DB-backed session token is already 256 bits of cryptographic
 * randomness, so the marginal value of HMAC over it is small. We add the
 * signature anyway so that:
 *   1. A leaked token without SESSION_SECRET (e.g. printed in logs) can't
 *      be combined with a stolen DB row to impersonate a user.
 *   2. Cookie tampering / truncation fails closed at the auth boundary
 *      before we touch the database.
 *
 * Cookie value format: `${rawToken}.${b64url(hmac)}`.
 *
 * In production SESSION_SECRET is required (throws at first session
 * touch if unset). In dev, missing SESSION_SECRET falls back to an
 * unsigned cookie so localhost works out of the box.
 */
function getSessionSecret(): Buffer | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SESSION_SECRET is required in production. Generate one with " +
          "`openssl rand -hex 32` and set it in Vercel env vars."
      );
    }
    return null;
  }
  return Buffer.from(secret, "utf8");
}

export function signSessionToken(token: string): string {
  const secret = getSessionSecret();
  if (!secret) return token; // dev-only fallback
  const sig = createHmac("sha256", secret).update(token).digest("base64url");
  return `${token}.${sig}`;
}

/**
 * Verify a signed cookie value and return the raw token, or null if the
 * signature is invalid / missing. Constant-time comparison.
 */
export function verifySessionCookie(value: string): string | null {
  const secret = getSessionSecret();
  // Dev fallback: no secret → trust whatever's in the cookie.
  if (!secret) return value;

  const dot = value.lastIndexOf(".");
  if (dot <= 0 || dot === value.length - 1) return null;
  const token = value.slice(0, dot);
  const providedSig = value.slice(dot + 1);

  const expectedSig = createHmac("sha256", secret).update(token).digest();
  let providedBuf: Buffer;
  try {
    providedBuf = Buffer.from(providedSig, "base64url");
  } catch {
    return null;
  }
  if (providedBuf.length !== expectedSig.length) return null;
  if (!timingSafeEqual(providedBuf, expectedSig)) return null;
  return token;
}
