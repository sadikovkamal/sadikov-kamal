import { redirect } from "next/navigation";
import { cache } from "react";
import type { User } from "@/db/schema";
import { getSessionCookie } from "./cookies";
import { setSessionCookie } from "./cookies";
import { validateSessionToken } from "./sessions";

/**
 * Get the current logged-in user, or null.
 *
 * Cached per-request via React.cache so multiple calls in the same render
 * pass de-duplicate to one DB lookup. If the session crossed its halfway
 * mark, `validateSessionToken` extends the DB row AND we refresh the
 * cookie here so the browser's `expires` attribute stays in sync — without
 * the cookie refresh the row would live for 30 more days but the cookie
 * would die on its original schedule.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = await getSessionCookie();
  if (!token) return null;
  const result = await validateSessionToken(token);
  if (!result) return null;

  // Renewal happens inside validateSessionToken when remaining < half life.
  // Refreshing the cookie unconditionally on every authenticated request
  // would be cheap, but writing Set-Cookie on every request churns the CDN
  // cache headers; only refresh when the DB expiry actually moved.
  await setSessionCookie(token, result.expiresAt);
  return result.user;
});

/**
 * Use in admin-only server components and actions.
 * Redirects to /login if no user, or to / if logged in but not admin.
 */
export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin" && user.role !== "super_admin") {
    redirect("/");
  }
  return user;
}

export * from "./cookies";
export * from "./sessions";
export * from "./tokens";
export * from "./rate-limit";
