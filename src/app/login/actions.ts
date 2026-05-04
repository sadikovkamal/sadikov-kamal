"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
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

export async function loginAction(
  formData: FormData
): Promise<{ error: string } | void> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    return { error: "Invalid email or password format" };
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

  if (!(await isLoginAllowed(ipKey)) || !(await isLoginAllowed(emailKey))) {
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
  // revealing valid emails by response time.
  const passwordOk = user
    ? await bcrypt.compare(password, user.passwordHash)
    : await bcrypt.compare(password, "$2a$12$dummyhashdummyhashdummyhashdu");

  if (!user || !passwordOk) {
    return { error: "Invalid email or password" };
  }

  const { token, expiresAt } = await createSession(user.id);
  await setSessionCookie(token, expiresAt);

  // redirect() throws an internal Next.js signal — must run outside try/catch.
  redirect(next && next.startsWith("/") ? next : "/admin");
}
