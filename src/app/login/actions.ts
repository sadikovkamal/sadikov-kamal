"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  createSession,
  setSessionCookie,
  isLoginAllowed,
  recordLoginAttempt,
} from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

/**
 * Lazily-built valid bcrypt hash used when the supplied email doesn't
 * exist. Comparing against a malformed string (the previous behaviour)
 * returned `false` instantly and leaked email existence via timing.
 * Hashed at the same cost factor as real user passwords (12).
 */
let dummyHashCache: string | null = null;
function getDummyHash(): string {
  if (!dummyHashCache) {
    const filler =
      "never-matches-any-password-" + crypto.randomBytes(16).toString("hex");
    dummyHashCache = bcrypt.hashSync(filler, 12);
  }
  return dummyHashCache;
}

/**
 * Sanitize the `next` redirect param. Must be a same-origin path:
 * - starts with "/"
 * - is NOT protocol-relative ("//evil.com")
 * - is NOT backslash-prefixed ("/\\evil.com" — some browsers normalize)
 */
function safeNext(next: string | undefined): string {
  if (!next) return "/admin";
  if (!next.startsWith("/")) return "/admin";
  if (next.startsWith("//")) return "/admin";
  if (next.startsWith("/\\")) return "/admin";
  return next;
}

export async function loginAction(
  formData: FormData
): Promise<{ error: string } | void> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    return { error: "Email yoki parol formati noto'g'ri" };
  }

  const { email, password, next } = parsed.data;

  // --- Rate limit ----------------------------------------------------------
  // Two dimensions so a noisy IP can't lock out a single email and a
  // distributed credential-stuffing attack can't slip past per-IP limits.
  // Vercel forwards the real IP in `x-forwarded-for`; strip the comma list.
  const hdrs = await headers();
  const fwd = hdrs.get("x-forwarded-for") ?? hdrs.get("x-real-ip") ?? "unknown";
  const ip = fwd.split(",")[0]!.trim() || "unknown";
  const ipKey = `ip:${ip}`;
  const emailKey = `email:${email.toLowerCase()}`;

  // Both gate checks run in parallel: each is a small SELECT, no need to
  // serialize. There is a benign TOCTOU race (two near-simultaneous logins
  // could both pass the check just before the counter increments) but the
  // window is single-digit milliseconds and rate-limit isn't a hard wall.
  const [ipAllowed, emailAllowed] = await Promise.all([
    isLoginAllowed(ipKey),
    isLoginAllowed(emailKey),
  ]);
  if (!ipAllowed || !emailAllowed) {
    return {
      error:
        "Juda ko'p urinish. 15 daqiqadan keyin yana urinib ko'ring.",
    };
  }

  // Record the attempt before bcrypt so even if the request times out the
  // counter still increments — better to over-count than to under-count.
  await Promise.all([recordLoginAttempt(ipKey), recordLoginAttempt(emailKey)]);

  // --- Auth ----------------------------------------------------------------
  const user = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });

  // Constant-time-ish: always run bcrypt even if user is missing, to avoid
  // revealing valid emails by response time. Both branches hash at cost 12.
  const passwordOk = user
    ? await bcrypt.compare(password, user.passwordHash)
    : await bcrypt.compare(password, getDummyHash());

  if (!user || !passwordOk) {
    return { error: "Email yoki parol noto'g'ri" };
  }

  const { token, expiresAt } = await createSession(user.id);
  await setSessionCookie(token, expiresAt);

  // redirect() throws an internal Next.js signal — must run outside try/catch.
  redirect(safeNext(next));
}
