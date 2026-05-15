import { redirect } from "next/navigation";
import { cache } from "react";
import type { User } from "@/db/schema";
import { getSessionCookie } from "./cookies";
import { validateSessionToken } from "./sessions";

/**
 * Get the current logged-in user, or null.
 *
 * Cached per-request via React.cache so multiple calls in the same render
 * pass de-duplicate to one DB lookup.
 *
 * Session renewal: `validateSessionToken` extends the DB row when the
 * session crosses its halfway mark. We deliberately do NOT refresh the
 * browser cookie here, because Next.js 16 forbids `cookies().set()` from
 * inside a Server Component render (it throws "Cookies can only be
 * modified in a Server Action or a Route Handler"). The cookie keeps its
 * original expiry; the DB row will live longer, but the user re-logs in
 * once the cookie expires. For 30-day sessions that's an acceptable drift.
 *
 * If we ever need true sliding cookies, do the refresh either:
 *   (a) inside a small dedicated server action wired to every page, or
 *   (b) in `proxy.ts` middleware, which can write to the response.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = await getSessionCookie();
  if (!token) return null;
  const result = await validateSessionToken(token);
  return result?.user ?? null;
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
