import { redirect } from "next/navigation";
import { cache } from "react";
import type { User } from "@/db/schema";
import { getSessionCookie } from "./cookies";
import { validateSessionToken } from "./sessions";

/**
 * Get the current logged-in user, or null.
 * Cached per-request via React.cache so multiple calls are deduplicated.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = await getSessionCookie();
  if (!token) return null;
  const result = await validateSessionToken(token);
  return result?.user ?? null;
});

/**
 * Use in server components and server actions that require authentication.
 * Redirects to /login if no user.
 */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Use in admin-only server components and actions.
 * Redirects to /login if no user, or to / if logged in but not admin.
 */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "super_admin") {
    redirect("/");
  }
  return user;
}

export * from "./cookies";
export * from "./sessions";
export * from "./tokens";
