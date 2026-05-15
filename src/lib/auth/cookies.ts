import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  signSessionToken,
  verifySessionCookie,
} from "./tokens";

export async function setSessionCookie(token: string, expiresAt: Date) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, signSessionToken(token), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Read and verify the session cookie. Returns the raw token (DB-side
 * lookup value), or undefined if the cookie is missing/tampered.
 */
export async function getSessionCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  const value = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!value) return undefined;
  const token = verifySessionCookie(value);
  return token ?? undefined;
}
