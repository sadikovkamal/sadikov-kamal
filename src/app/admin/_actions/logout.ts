"use server";

import { redirect } from "next/navigation";
import {
  getSessionCookie,
  clearSessionCookie,
  invalidateSession,
} from "@/lib/auth";

export async function logoutAction() {
  const token = await getSessionCookie();
  if (token) await invalidateSession(token);
  await clearSessionCookie();
  redirect("/login");
}
