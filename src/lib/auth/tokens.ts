import { randomBytes, createHash } from "crypto";

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
export const SESSION_COOKIE_NAME = "provia_session";
