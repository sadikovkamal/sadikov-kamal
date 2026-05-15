# Phase 2 — Auth and Admin Guard

**Goal:** Build a custom session-based authentication system from scratch.
Login page works. The `/admin/*` routes are protected. Only users with the
admin role can access them.

**Estimated time:** 1 session (~3-4 hours)

---

## What you'll have at the end

- A working `/login` page (email + password)
- Server-side session storage in the `sessions` table (revocable)
- HTTP-only secure cookies, no JWT
- `requireAdmin()` helper for server components and actions
- Middleware that redirects unauthenticated users away from `/admin/*`
- Logout action
- Protected `/admin` placeholder page that shows the logged-in user

---

## Why custom auth (not Auth.js / NextAuth)?

Three reasons specific to this project:

1. **One user role, one provider, one flow.** Auth.js is built for many
   providers and complex flows. We have email/password and admins. The
   library overhead isn't worth it.
2. **Vibe coding debuggability.** Auth.js has a lot of magic and config
   that's hard to step through when something breaks.
3. **Server-revocable sessions.** With JWT you can't kick a user out until
   the token expires. With sessions in DB, you delete a row and they're out.

The pattern: **Lucia-style** — random session tokens stored in a DB table,
no JWT, HTTP-only cookies. Lucia (the library) was discontinued, but its
pattern is still the right one.

---

## Steps

### 2.1. Install crypto helpers

The Web Crypto API is built into Node 20+ and Next.js — no install needed
for token generation. We already have `bcryptjs` from Phase 1.

### 2.2. Session token utilities

Create `src/lib/auth/tokens.ts`:

```typescript
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
```

### 2.3. Session DB operations

Create `src/lib/auth/sessions.ts`:

```typescript
import { db } from "@/db";
import { sessions, users, type User } from "@/db/schema";
import { eq, lt } from "drizzle-orm";
import {
  generateSessionToken,
  hashSessionToken,
  SESSION_DURATION_MS,
} from "./tokens";

export async function createSession(userId: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const { token, hashedToken } = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.insert(sessions).values({
    id: hashedToken,
    userId,
    expiresAt,
  });

  return { token, expiresAt };
}

/**
 * Look up a session by the raw token from a cookie.
 * Returns null if the session is missing, expired, or the user is gone.
 *
 * Side effects:
 * - Deletes the session if it's expired (lazy cleanup)
 * - Renews the session if more than half its lifetime has passed
 */
export async function validateSessionToken(
  token: string
): Promise<{ user: User; expiresAt: Date } | null> {
  const hashedToken = hashSessionToken(token);

  const result = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, hashedToken))
    .limit(1);

  const row = result[0];
  if (!row) return null;

  const { session, user } = row;

  // Expired?
  if (session.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, hashedToken));
    return null;
  }

  // Renew if past halfway mark
  const halfwayPoint = SESSION_DURATION_MS / 2;
  const remaining = session.expiresAt.getTime() - Date.now();
  if (remaining < halfwayPoint) {
    const newExpiry = new Date(Date.now() + SESSION_DURATION_MS);
    await db
      .update(sessions)
      .set({ expiresAt: newExpiry })
      .where(eq(sessions.id, hashedToken));
    return { user, expiresAt: newExpiry };
  }

  return { user, expiresAt: session.expiresAt };
}

export async function invalidateSession(token: string): Promise<void> {
  const hashedToken = hashSessionToken(token);
  await db.delete(sessions).where(eq(sessions.id, hashedToken));
}

export async function invalidateAllUserSessions(
  userId: string
): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Periodic cleanup — call from a cron later. Safe to skip for MVP. */
export async function purgeExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
```

### 2.4. Cookie helpers

Create `src/lib/auth/cookies.ts`:

```typescript
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "./tokens";

export async function setSessionCookie(token: string, expiresAt: Date) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
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

export async function getSessionCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value;
}
```

### 2.5. The `getCurrentUser` and `requireAdmin` helpers

Create `src/lib/auth/index.ts`:

```typescript
import { redirect } from "next/navigation";
import { cache } from "react";
import { getSessionCookie } from "./cookies";
import { validateSessionToken } from "./sessions";
import type { User } from "@/db/schema";

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
```

Re-export the cookie/session helpers too for convenience:

```typescript
export * from "./cookies";
export * from "./sessions";
export * from "./tokens";
```

### 2.6. Edge middleware (lightweight check only)

Create `src/middleware.ts`:

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/tokens";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only guard /admin/*
  if (!pathname.startsWith("/admin")) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // The middleware can't talk to the DB (Edge runtime, no postgres-js).
  // It only checks "is there a cookie?". Real validation happens in
  // server components via requireAdmin(). This is fine — defense in depth,
  // not the only line of defense.
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
```

**Important note:** the middleware only checks for cookie presence. The
**actual user validation** happens in server components calling
`requireAdmin()`. This double-layer is intentional:

- Middleware = fast redirect for the common case (no cookie at all)
- Server component = real DB check (cookie could be stale, user could be deleted, role could have changed)

### 2.7. Login server action

Create `src/app/login/actions.ts`:

```typescript
"use server";

import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { createSession, setSessionCookie } from "@/lib/auth";
import { redirect } from "next/navigation";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

export async function loginAction(formData: FormData) {
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

  redirect(next ?? "/admin");
}
```

### 2.8. Login page

Create `src/app/login/page.tsx`:

```tsx
import { loginAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoginForm } from "./login-form";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Already logged in? Send to /admin
  const user = await getCurrentUser();
  if (user) redirect("/admin");

  const { next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Admin Login</h1>
          <p className="text-muted-foreground text-sm">
            Provia administration
          </p>
        </div>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
```

Create `src/app/login/login-form.tsx` (client component for error UI):

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const formData = new FormData(e.currentTarget);
        startTransition(async () => {
          const result = await loginAction(formData);
          if (result?.error) setError(result.error);
        });
      }}
      className="space-y-4"
    >
      <input type="hidden" name="next" value={next ?? ""} />
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
```

### 2.9. Logout action and shared header

Create `src/app/admin/_actions/logout.ts`:

```typescript
"use server";

import { getSessionCookie, clearSessionCookie, invalidateSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function logoutAction() {
  const token = await getSessionCookie();
  if (token) await invalidateSession(token);
  await clearSessionCookie();
  redirect("/login");
}
```

### 2.10. Admin layout and placeholder dashboard

Create `src/app/admin/layout.tsx`:

```tsx
import { requireAdmin } from "@/lib/auth";
import { logoutAction } from "./_actions/logout";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between p-4">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="font-semibold">
              Provia · Admin
            </Link>
            {/* Nav links added in later phases */}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-sm">
              {user.fullName}
            </span>
            <form action={logoutAction}>
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl p-6">{children}</main>
    </div>
  );
}
```

Create `src/app/admin/page.tsx`:

```tsx
import { requireAdmin } from "@/lib/auth";

export default async function AdminDashboard() {
  const user = await requireAdmin();
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold">Welcome, {user.fullName}</h1>
      <p className="text-muted-foreground">
        Dashboard coming in Phase 9. For now, this is the admin landing page.
      </p>
    </div>
  );
}
```

### 2.11. Add `SESSION_SECRET` for the future (optional)

We don't actually need this — our sessions don't sign anything (the token
itself is random and validated by DB lookup). But add it to `.env.example`
anyway in case we add CSRF protection later.

---

## File structure changes

```
src/
├── middleware.ts                          (new)
├── lib/
│   └── auth/
│       ├── index.ts                       (new — exports requireAdmin etc.)
│       ├── tokens.ts                      (new)
│       ├── sessions.ts                    (new)
│       └── cookies.ts                     (new)
└── app/
    ├── login/
    │   ├── page.tsx                       (new)
    │   ├── login-form.tsx                 (new)
    │   └── actions.ts                     (new)
    └── admin/
        ├── layout.tsx                     (new)
        ├── page.tsx                       (new)
        └── _actions/
            └── logout.ts                  (new)
```

---

## Acceptance criteria

- [ ] Visit `/admin` while logged out → redirected to `/login?next=/admin`
- [ ] Log in with the seeded admin (`admin@example.com` / `ChangeMe123!`)
      → redirected to `/admin`, see "Welcome, Admin"
- [ ] In `psql`, `SELECT id, user_id, expires_at FROM sessions;` shows your row
- [ ] The session cookie in browser devtools is `HttpOnly` (and `Secure` in prod)
- [ ] Sign out → cookie cleared, session row deleted, redirected to `/login`
- [ ] Visit `/login` while logged in → redirected to `/admin`
- [ ] Manually delete your session row in DB while still on the page,
      refresh → redirected to login (DB-revocable sessions confirmed)
- [ ] Wrong password attempt does not reveal whether email exists
      (response time is similar)
- [ ] After 30 days the session would expire (we trust this without testing)

---

## Common pitfalls

- **Middleware can't reach Postgres** — the Edge runtime doesn't support
  `postgres-js`. That's why our middleware only checks cookie presence.
  All real auth happens in server components.
- **Cookies in Server Actions** — `cookies()` is async in Next.js 15.
  `await cookies()` always.
- **Login form re-submitting on Enter twice** — `useTransition` prevents
  double submission while pending.
- **`redirect()` inside try/catch** — `redirect()` throws internally.
  Don't wrap server action redirects in try/catch or it won't redirect.
- **bcrypt cost too high in dev** — cost 12 takes ~250ms. Fine for login
  but if it bothers you in tests, lower to 10 there.
- **Email case sensitivity** — we lowercase emails on login but you'd
  also want to lowercase on signup (none in MVP). Add it to your seed
  if needed.

---

## What's next

In Phase 3 we render markdown + LaTeX, which is a prerequisite for the
problem creation UI.

→ [Phase 3 — Markdown and LaTeX Rendering](./phase-03-markdown-and-latex-rendering.md)
