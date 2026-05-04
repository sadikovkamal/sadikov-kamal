# Phase 10 — Polish and Production

**Goal:** Move from "works on my laptop" to "runs reliably for real use".
Hosted Postgres, error tracking, cron jobs for cleanup, custom R2 domain,
backup strategy, hardening, and the README + admin guide that explain
everything.

**Estimated time:** 1-2 sessions (~4-6 hours)

---

## What you'll have at the end

- Production Postgres on Neon (or Railway / VPS — pick one and migrate)
- Sentry (or similar) capturing server-side errors
- Cron jobs for: expired session cleanup, draft image cleanup
- Custom domain for R2 public URL (optional but recommended)
- Daily DB backup running
- Rate limit on `/login` to slow down brute force attempts
- `README.md` for the project
- `docs/admin-guide.md` for the human admins
- Production checklist run-through

---

## Steps

### 10.1. Pick your production Postgres

For a small admin-only platform, three reasonable options:

| Option | Free tier | Pros | Cons |
|---|---|---|---|
| **Neon** | 0.5 GB storage, 1 project | Branching, autoscaling, generous free tier | Cold start latency on free tier |
| **Railway** | $5 credit/month, scales with usage | Familiar Docker-style, simple dashboard | No free tier with persistence beyond credits |
| **VPS (Hetzner CX11)** | ~$4/mo for 2 GB RAM | Full control, persistent | You manage backups, updates, security |

**Recommendation for MVP:** Neon. Free tier covers it for months, and the
branching feature is amazing for testing migrations against a copy of prod.

#### 10.1.1. Set up Neon

1. Sign up at https://neon.tech
2. Create a project: `provia-prod`
3. Region: closest to your user base (probably EU for Uzbekistan)
4. Copy the connection string from the dashboard

#### 10.1.2. Push the schema

Set `DATABASE_URL` to the Neon connection string in a temporary `.env.production`:

```bash
DATABASE_URL="postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require" npm run db:migrate
```

This runs the same migration files that built your local DB. Verify with
the Neon SQL editor that all tables exist.

#### 10.1.3. Seed the production DB (sparingly)

Only seed the admin user and reference data, not test problems:

```bash
DATABASE_URL="..." \
SEED_ADMIN_EMAIL="you@yourdomain.com" \
SEED_ADMIN_PASSWORD="$(openssl rand -base64 24)" \
SEED_ADMIN_NAME="Your Name" \
  npm run db:seed
```

Save the generated password in your password manager.

#### 10.1.4. Update Vercel env vars

In Vercel project settings → Environment Variables, replace the placeholder
`DATABASE_URL` with the Neon connection string. **Important:** mark it
production-only if you want to keep using local DB for preview deployments,
or set it for all environments.

Redeploy (push a commit or click Redeploy). `/api/health` should now work
in production.

### 10.2. Error tracking with Sentry

```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

The wizard:
- Creates a Sentry project (you sign in, pick "Next.js")
- Adds `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
- Adds env vars for the DSN to `.env.local`
- Modifies `next.config.ts` to wrap with Sentry's webpack plugin

Add the Sentry env vars to Vercel.

Verify by visiting `/api/health` after temporarily breaking the connection
string — the error should appear in your Sentry dashboard.

For production hygiene, configure Sentry to **not** capture user
emails / passwords. The default config strips PII; double-check by checking
a sample event.

### 10.3. Cron jobs

Vercel Cron is free for hobby plans (up to 2 jobs).

#### 10.3.1. Expired session cleanup

Create `src/app/api/cron/cleanup-sessions/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { purgeExpiredSessions } from "@/lib/auth";

export async function GET(request: Request) {
  // Vercel Cron sets this header
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  await purgeExpiredSessions();
  return NextResponse.json({ ok: true });
}
```

Add `CRON_SECRET` env var (long random string) to Vercel.

Configure `vercel.json` at the repo root:

```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-sessions",
      "schedule": "0 3 * * *"
    },
    {
      "path": "/api/cron/cleanup-draft-images",
      "schedule": "0 4 * * *"
    }
  ]
}
```

#### 10.3.2. Draft image cleanup

Create `src/app/api/cron/cleanup-draft-images/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { ListObjectsV2Command, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID!}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  const Bucket = process.env.R2_BUCKET_NAME!;
  const cutoff = Date.now() - 1000 * 60 * 60 * 24; // 24h

  let deleted = 0;
  let ContinuationToken: string | undefined;

  do {
    const list = await s3.send(
      new ListObjectsV2Command({
        Bucket,
        Prefix: "problems/draft/",
        ContinuationToken,
      })
    );
    for (const obj of list.Contents ?? []) {
      if (
        obj.Key &&
        obj.LastModified &&
        obj.LastModified.getTime() < cutoff
      ) {
        await s3.send(new DeleteObjectCommand({ Bucket, Key: obj.Key }));
        deleted++;
      }
    }
    ContinuationToken = list.NextContinuationToken;
  } while (ContinuationToken);

  return NextResponse.json({ deleted });
}
```

This deletes images uploaded under `problems/draft/` more than 24 hours
ago. Images attached to saved problems live under `problems/{id}/` so
they're untouched.

### 10.4. Login rate limiting

Without rate limiting, an attacker can try millions of passwords. Even
with bcrypt cost 12, distributing attempts across thousands of cores
becomes feasible.

Cheap MVP rate limit: store login attempts in the DB.

Create migration adding a table:

```typescript
// src/db/schema/auth.ts (new file)
import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: text("id").primaryKey(), // synthetic ID
    identifier: text("identifier").notNull(), // email or IP
    attemptedAt: timestamp("attempted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    identifierIdx: index("login_attempts_identifier_idx").on(t.identifier),
    timeIdx: index("login_attempts_time_idx").on(t.attemptedAt),
  })
);
```

Generate + apply migration: `npm run db:generate && npm run db:migrate`.

Update `src/app/login/actions.ts`:

```typescript
import { loginAttempts } from "@/db/schema";
import { gte, and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { randomBytes } from "crypto";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 min

async function checkRateLimit(identifier: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - WINDOW_MS);
  const recent = await db
    .select({ id: loginAttempts.id })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.identifier, identifier),
        gte(loginAttempts.attemptedAt, cutoff)
      )
    );
  return recent.length < MAX_ATTEMPTS;
}

async function recordAttempt(identifier: string) {
  await db.insert(loginAttempts).values({
    id: randomBytes(8).toString("hex"),
    identifier,
  });
}

// In loginAction, before bcrypt:
const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "unknown";
const limitKey = `ip:${ip}`;
if (!(await checkRateLimit(limitKey))) {
  return { error: "Too many attempts. Try again in 15 minutes." };
}
await recordAttempt(limitKey);
```

Add a third cron at `0 5 * * *` to delete login_attempts older than 24h
to keep the table small.

For a more robust approach, use Upstash Redis with `@upstash/ratelimit`.
Out of scope for MVP unless you actually see attack traffic.

### 10.5. Daily DB backup

Neon takes automatic point-in-time backups on paid plans (free tier: 24h
retention only). For real backups:

#### Option A — Neon paid tier
The simplest path. ~$19/mo gets you 7-day point-in-time recovery.

#### Option B — Self-managed `pg_dump` to R2

Add a cron route `/api/cron/backup-db`:

```typescript
import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { uploadFile } from "@/lib/storage/r2";

const execAsync = promisify(exec);

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  // Vercel functions don't have pg_dump available. This won't work.
  // Use an external service like a scheduled GitHub Action instead.
  return NextResponse.json({ error: "Use GitHub Actions for backups" });
}
```

Better approach: a GitHub Actions workflow that runs `pg_dump` daily and
uploads the dump to R2 (or S3, or wherever).

`.github/workflows/db-backup.yml`:

```yaml
name: DB Backup
on:
  schedule:
    - cron: "0 2 * * *"
  workflow_dispatch:

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Postgres client
        run: sudo apt-get update && sudo apt-get install -y postgresql-client
      - name: Dump and upload
        env:
          DATABASE_URL: ${{ secrets.PROD_DATABASE_URL }}
          R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
          R2_BUCKET_NAME: ${{ secrets.R2_BUCKET_NAME }}
        run: |
          DATE=$(date +%Y-%m-%d)
          pg_dump "$DATABASE_URL" | gzip > backup-$DATE.sql.gz
          # Upload via aws CLI configured for R2
          aws configure set aws_access_key_id "$R2_ACCESS_KEY_ID"
          aws configure set aws_secret_access_key "$R2_SECRET_ACCESS_KEY"
          aws s3 cp backup-$DATE.sql.gz \
            "s3://$R2_BUCKET_NAME/backups/backup-$DATE.sql.gz" \
            --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"
```

Add the secrets in GitHub repo settings.

### 10.6. Custom R2 domain

The `pub-xxxxx.r2.dev` URLs are throttled by Cloudflare and not for
production traffic.

1. Cloudflare → R2 → your bucket → Settings → Custom Domains → Connect Domain
2. Enter e.g. `assets.yourdomain.com`. Cloudflare must manage DNS for this
   domain (move nameservers to Cloudflare if not already).
3. Cloudflare provisions an SSL cert and serves from the custom domain.
4. Update `R2_PUBLIC_URL` env var to `https://assets.yourdomain.com`.

**Migration concern:** existing problems have markdown bodies with
`pub-xxxxx.r2.dev` URLs baked in. Two options:

- Run a one-off SQL update:
  ```sql
  UPDATE problems
  SET body_md = replace(body_md, 'https://pub-xxxxx.r2.dev/', 'https://assets.yourdomain.com/'),
      solution_md = replace(solution_md, 'https://pub-xxxxx.r2.dev/', 'https://assets.yourdomain.com/');
  ```
- Or set up a 301 redirect from R2.dev to the custom domain (not always
  possible with R2 itself).

Plan this **before** you have a lot of data.

### 10.7. Project README

Create `README.md` at the project root:

```markdown
# Provia

A web platform for managing a database of math olympiad problems.

## Stack

- Next.js 15 (App Router) + TypeScript
- PostgreSQL + Drizzle ORM
- Custom session-based auth
- Cloudflare R2 for image storage
- Tailwind + shadcn/ui

## Local development

### Prerequisites

- Node.js 20+
- Docker Desktop
- An Anthropic / OpenAI account if you want to use the AI bulk-import workflow

### Setup

1. Clone the repo, `npm install`
2. Copy `.env.example` to `.env.local` and fill in:
   - `DATABASE_URL` — leave the docker default if using local DB
   - R2 credentials (set up an R2 bucket per `docs/r2-setup.md`)
3. Start the local DB: `docker compose up -d`
4. Apply migrations: `npm run db:migrate`
5. Seed admin + reference data: `npm run db:seed`
6. Start the dev server: `npm run dev`
7. Visit http://localhost:3000/login

### Useful commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start dev server |
| `npm run db:studio` | Browse the database in a web UI |
| `npm run db:generate` | Generate a migration after schema changes |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:push` | Push schema directly (dev only, no migration files) |
| `npm run db:seed` | Seed reference data |

## Deployment

Pushed to `main` auto-deploys via Vercel.

Production env vars: see Vercel project settings.

Production database: Neon. See `docs/admin-guide.md` for connection details
and backup info.

## Documentation

- `docs/format-spec.md` — bulk import bundle format
- `docs/ai-import-prompt.md` — prompt for AI-assisted bulk imports
- `docs/admin-guide.md` — operational guide for human admins

## License

Private.
```

### 10.8. Admin guide

Create `docs/admin-guide.md`:

```markdown
# Admin Guide

This document is for the humans operating the platform.

## Logging in

Production URL: https://yourdomain.com/login
Default admin: stored in your password manager.

## Adding problems

### One at a time

1. Go to `/admin/problems/new`
2. Fill in the metadata on the right (source, year, topics, classes,
   difficulty)
3. Write the problem in Markdown in the left editor. Use LaTeX for math
   (`$inline$`, `$$display$$`).
4. Drag images into the editor — they upload to R2 automatically and
   the markdown reference is inserted at the cursor.
5. Click Create.

### In bulk

The recommended flow:

1. Get the source material (PDF, web page, scanned book chapter).
2. Open Claude or ChatGPT in a new chat.
3. Copy the prompt from `docs/ai-import-prompt.md`.
4. Paste the source material at the bottom.
5. The AI returns a `problems.md` file.
6. Save it to a new folder, add an `images/` subfolder with any figures
   referenced.
7. Zip the folder.
8. Upload at `/admin/import`. Click Preview to validate, then Import.

### Rules of thumb

- Keep batches under 50 problems for easier review.
- Always Preview before Import — fix errors in the source markdown first.
- Duplicates (same source + year + problem number) are skipped automatically.
- Images uploaded as part of a batch live forever — don't include the same
  PDF over and over.

## Managing taxonomy

- **Topics:** `/admin/topics`. Hierarchical. New topics created during
  bulk import are flat (no parent) — re-parent them after import.
- **Sources:** `/admin/sources`. Set the kind (olympiad / book / course)
  and country.
- **Tags:** `/admin/tags`. Free-form. Use the merge feature to consolidate
  near-duplicates ("am-gm" + "AM-GM" + "amgm").

## Backups

Automated daily at 02:00 UTC. Stored in the R2 bucket under `backups/`.
Keep the last 30 days; older ones are deleted manually for now.

To restore: download the `.sql.gz` from R2, gunzip, restore with
`psql $DATABASE_URL < backup.sql`.

## Common issues

**Image not loading after publish:** R2 propagation can take a few seconds.
If it persists, check the URL in the markdown matches an object in the bucket.

**Bulk import says "duplicate":** A problem with the same source/year/number
exists. Either skip it (default) or delete the existing one first if you
want to replace.

**Login locked out:** wait 15 minutes (rate limit) or clear `login_attempts`
table directly.
```

### 10.9. Production checklist

Before announcing the platform, verify:

- [ ] Production DB is on managed hosting, not localhost
- [ ] All env vars are in Vercel: `DATABASE_URL`, `SESSION_SECRET` (if used),
      R2 (5 vars), Sentry DSN, `CRON_SECRET`
- [ ] First admin user created with a strong password
- [ ] Logging in to the production URL works
- [ ] Health check `/api/health` returns OK
- [ ] Sentry receives a test error
- [ ] At least one problem created via UI and visible
- [ ] Bulk import of the sample bundle works in production
- [ ] Custom R2 domain set up (or noted as TODO)
- [ ] Daily backup workflow runs (manually trigger to verify)
- [ ] Cron jobs visible in Vercel dashboard
- [ ] Repository is private
- [ ] No secrets in git history (`git log --all --full-history -- .env*`)
- [ ] HTTPS enforced (Vercel does this by default)
- [ ] Rate limiting on `/login` is tested (try 6 wrong passwords in a row)

### 10.10. Hardening notes

A few small things to tighten:

- **Cookie `__Host-` prefix:** rename `SESSION_COOKIE_NAME` to
  `__Host-provia_session` for an extra layer of cookie integrity.
  Requires `Secure`, `Path=/`, no `Domain` — which we already do.
- **CSP header:** add a Content Security Policy in `next.config.ts`.
  Start with a `report-only` policy and tighten over time.
- **`Strict-Transport-Security`:** Vercel sets this by default for
  custom domains.
- **Drizzle Studio in production:** never expose it. It's a local-only
  tool; use Neon's SQL editor or `psql` for production queries.
- **Admin user count visibility:** consider an audit log table that
  records create/update/delete actions on `problems` so you can review
  what each admin did. Add later if you have multiple admins.

---

## File structure changes

```
.github/
└── workflows/
    └── db-backup.yml                       (new)
docs/
└── admin-guide.md                          (new)
src/
├── db/
│   └── schema/
│       └── auth.ts                         (new — login_attempts)
└── app/
    ├── login/
    │   └── actions.ts                      (modified — rate limit)
    └── api/
        └── cron/
            ├── cleanup-sessions/
            │   └── route.ts                (new)
            └── cleanup-draft-images/
                └── route.ts                (new)
README.md                                   (new)
vercel.json                                 (new)
sentry.client.config.ts                     (new — by wizard)
sentry.server.config.ts                     (new — by wizard)
sentry.edge.config.ts                       (new — by wizard)
```

---

## Acceptance criteria

- [ ] Production DB is on Neon (or your chosen host) and the migration
      has been applied
- [ ] Vercel deployment uses the production DB
- [ ] Sentry receives test errors from production
- [ ] Vercel cron jobs appear in the dashboard with successful recent runs
- [ ] Daily DB backup ran at least once (check the R2 bucket)
- [ ] Login rate limit blocks after 5 wrong attempts
- [ ] README and admin guide are committed
- [ ] All items in the production checklist (10.9) are checked

---

## Common pitfalls

- **Migrations against prod don't roll back automatically** — Drizzle
  doesn't do down migrations. Test every migration on a Neon branch first.
- **Cron job auth bypass** — if `CRON_SECRET` isn't set, the cron route
  is publicly callable and could be abused. Always check the header.
- **Sentry quota** — free tier = 5K events/month. A noisy validation
  error in a hot path can burn through quickly. Add `beforeSend` filters
  to drop expected errors.
- **Backup restore not tested** — a backup you can't restore from is
  worthless. After your first backup, do a test restore to a fresh DB.
- **R2 custom domain DNS propagation** — can take up to 24h. Plan ahead
  if you're migrating images.
- **`process.env` in Edge runtime** — middleware runs on Edge and can
  only access env vars exposed at build time. Keep cron logic in the
  Node runtime (the default for `route.ts`).
- **Vercel function timeouts** — bulk import of large bundles may time
  out (default 10s on hobby plan, 60s on pro). Hobby = 10s; pro = 60s.
  If you hit this, move execute to a background job (Inngest, Trigger.dev,
  or a small queue-worker on a VPS).

---

## What's next

You're done with the MVP plan. From here, possible directions:

- **Public read access:** add a `/problems` route that lists problems
  without admin guard. Keep solutions hidden behind a "show solution"
  click.
- **Student accounts:** add `student` role, an `attempts` table, a
  "Mark as solved" button.
- **Lessons / courses:** new tables `courses`, `lessons`, `lesson_problems`.
- **Discussions:** a `comments` table on problems.
- **Search improvements:** add `pg_trgm` for fuzzy match, or `pgvector`
  for "find similar problems".
- **Mobile app:** the API is already there in the form of server actions;
  expose them via a thin REST or tRPC layer.

Each of these can be its own multi-phase plan when the time comes.
