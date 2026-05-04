"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, setSessionCookie } from "@/lib/auth";

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

  const user = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });

  // Constant-time-ish: always run bcrypt even if user is missing,
  // to avoid revealing valid emails by response time.
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
