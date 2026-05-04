# Phase 0 — Project Skeleton

**Goal:** A bare Next.js + TypeScript app with a local Postgres database
running in Docker, Drizzle ORM wired up, and the project deployed to Vercel.

**Estimated time:** 1 session (~2-3 hours)

---

## What you'll have at the end

- Empty Next.js app deployed to Vercel under a real URL
- Local Postgres running in Docker, reachable from the app
- Drizzle ORM connected, a "hello" query works against the DB
- Environment variables organized (`.env.local`, `.env.example`)
- Git repo initialized, pushed to GitHub, auto-deploy to Vercel set up

---

## Prerequisites

- Node.js 20+ installed
- Docker Desktop installed and running
- GitHub account
- Vercel account (sign in with GitHub)
- Cloudflare account (we'll use this in Phase 4, sign up now)

---

## Steps

### 0.1. Create the Next.js project

```bash
npx create-next-app@latest provia \
  --typescript --tailwind --app --src-dir --import-alias "@/*" --eslint
cd provia
```

Choices to confirm: TypeScript ✓, Tailwind ✓, App Router ✓, `src/` directory ✓,
import alias `@/*` ✓.

### 0.2. Install core dependencies

```bash
# Drizzle + Postgres driver
npm install drizzle-orm postgres
npm install -D drizzle-kit

# Validation
npm install zod

# Utilities
npm install clsx tailwind-merge
```

### 0.3. Set up shadcn/ui

```bash
npx shadcn@latest init
```

Pick defaults: Default style, Slate base color, CSS variables yes.

Add the components we know we'll need throughout:

```bash
npx shadcn@latest add button input label form card table dialog \
  dropdown-menu select textarea toast sonner badge separator
```

### 0.4. Local Postgres in Docker

Create `docker-compose.yml` at the project root:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: provia-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: provia_admin
      POSTGRES_PASSWORD: dev_password_change_me
      POSTGRES_DB: provia
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

Start it:

```bash
docker compose up -d
```

Verify it's running:

```bash
docker compose ps
docker exec -it provia-db psql -U provia_admin -d provia -c "SELECT version();"
```

### 0.5. Environment variables

Create `.env.local`:

```env
DATABASE_URL=postgresql://provia_admin:dev_password_change_me@localhost:5432/provia

# Filled in later phases:
# SESSION_SECRET=
# R2_ACCOUNT_ID=
# R2_ACCESS_KEY_ID=
# R2_SECRET_ACCESS_KEY=
# R2_BUCKET_NAME=
# R2_PUBLIC_URL=
```

Create `.env.example` (commit this, no real values):

```env
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
SESSION_SECRET=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=
```

Make sure `.env.local` is in `.gitignore` (Next.js does this by default,
but verify).

### 0.6. Drizzle configuration

Create `drizzle.config.ts` at the project root:

```typescript
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema/*",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
} satisfies Config;
```

Create the Drizzle client at `src/db/index.ts`:

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL!;

// Use a singleton in dev to avoid exhausting connections on hot reload
declare global {
  // eslint-disable-next-line no-var
  var _pgClient: ReturnType<typeof postgres> | undefined;
}

const client = global._pgClient ?? postgres(connectionString, { max: 10 });
if (process.env.NODE_ENV !== "production") global._pgClient = client;

export const db = drizzle(client);
```

Create `src/db/schema/index.ts` (empty for now, fills in Phase 1):

```typescript
// Re-exports all table schemas. Populated in Phase 1.
export {};
```

### 0.7. Add scripts to `package.json`

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "db:push": "drizzle-kit push"
  }
}
```

`db:studio` opens a web UI to inspect the database — your replacement for
Supabase Studio. `db:push` is for fast iteration in dev (skips migration files);
`db:generate` + `db:migrate` is for production-grade workflow.

### 0.8. Smoke test the DB connection

Create `src/app/api/health/route.ts`:

```typescript
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const result = await db.execute(sql`SELECT 1 as ok, NOW() as time`);
    return NextResponse.json({
      status: "ok",
      db: result[0],
    });
  } catch (e) {
    return NextResponse.json(
      { status: "error", error: String(e) },
      { status: 500 }
    );
  }
}
```

Start the dev server: `npm run dev`. Visit http://localhost:3000/api/health.
Expected output: `{"status":"ok","db":{"ok":1,"time":"..."}}`

### 0.9. Replace the default home page

Edit `src/app/page.tsx` to a placeholder:

```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold">Provia</h1>
      <p className="text-muted-foreground mt-2">
        Admin panel coming soon. Visit{" "}
        <a className="underline" href="/api/health">
          /api/health
        </a>
        .
      </p>
    </main>
  );
}
```

### 0.10. Git + GitHub

```bash
git init
git add .
git commit -m "Phase 0: project skeleton"
```

Create a new private repo on GitHub (`provia`) and push:

```bash
git remote add origin git@github.com:YOUR_USERNAME/provia.git
git branch -M main
git push -u origin main
```

### 0.11. Vercel deployment

1. Go to https://vercel.com/new
2. Import your `provia` repo
3. Framework auto-detected: Next.js
4. Add environment variable: `DATABASE_URL` — for now set it to a placeholder
   (Vercel can't reach your local Docker DB). We'll replace this in Phase 10
   when we set up production Postgres. Use a value like
   `postgresql://placeholder:placeholder@placeholder:5432/placeholder`
   so the build doesn't fail.
5. Deploy.

The `/api/health` endpoint will fail in production (no real DB) — that's
expected for now. The home page should load fine.

### 0.12. (Optional) `package.json` engines

Pin Node version to avoid surprises:

```json
{
  "engines": {
    "node": ">=20.0.0"
  }
}
```

---

## File structure at the end of Phase 0

```
provia/
├── docker-compose.yml
├── drizzle.config.ts
├── .env.local              (gitignored)
├── .env.example
├── next.config.ts
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── src/
    ├── app/
    │   ├── api/
    │   │   └── health/
    │   │       └── route.ts
    │   ├── layout.tsx
    │   ├── page.tsx
    │   └── globals.css
    ├── components/
    │   └── ui/             (shadcn components)
    ├── db/
    │   ├── index.ts
    │   ├── schema/
    │   │   └── index.ts
    │   └── migrations/     (empty for now)
    └── lib/
        └── utils.ts        (created by shadcn init)
```

---

## Acceptance criteria

You can move on to Phase 1 when **all** of these are true:

- [ ] `docker compose ps` shows the `provia-db` container as running
- [ ] `npm run dev` starts the app on http://localhost:3000 with no errors
- [ ] The home page loads and shows "Provia"
- [ ] Visiting `/api/health` locally returns `{"status":"ok", ...}`
- [ ] `npm run db:studio` opens the Drizzle Studio UI in the browser
- [ ] The project is pushed to GitHub
- [ ] The Vercel deployment succeeds and the home page loads at the
      production URL (the `/api/health` endpoint failing in production is
      expected for now)
- [ ] `.env.local` is **not** in the GitHub repo

---

## Common pitfalls

- **Port 5432 already in use** — if you have local Postgres installed, either
  stop it (`brew services stop postgresql` on macOS) or change the docker port
  mapping to `"5433:5432"` and update `DATABASE_URL` to use port 5433.
- **Vercel build fails on missing env vars** — make sure `DATABASE_URL` exists
  in Vercel project settings, even if it's a placeholder.
- **Drizzle commands fail with "Cannot find module"** — make sure `drizzle-kit`
  is in `devDependencies`, not just `dependencies`. Run `npm install` again.
- **Docker container exits immediately** — check `docker compose logs postgres`.
  Most often a volume permission issue; try `docker compose down -v` and
  recreate.

---

## Next phase

→ [Phase 1 — Database Schema](./phase-01-database-schema.md)
