# Deployment

End-to-end guide for shipping this app to Vercel + Neon + Cloudflare R2.

## Stack

| Layer | Service | Plan | Notes |
|---|---|---|---|
| App hosting | **Vercel** | Hobby (free) → Pro | Auto-deploys from `main` |
| Database | **Neon Postgres** | Free → Launch | Frankfurt region |
| Object storage | **Cloudflare R2** | Free tier | Images + weekly backups |
| DNS + Domain | **Cloudflare** | Free | Registrar + DNS in one place |
| Error tracking | **Sentry** (optional) | Free 5k events/mo | |
| Uptime | **UptimeRobot** (optional) | Free | Pings `/api/health` |

## One-time account setup

1. **GitHub** — repo must be pushable; Vercel auto-deploy reads from here.
2. **Neon** — https://neon.tech (sign in with GitHub).
3. **Cloudflare** — https://dash.cloudflare.com (R2 + DNS + Registrar all live here).
4. **Vercel** — https://vercel.com (sign in with GitHub).

## Step-by-step

### 1. Database — Neon

1. Neon Console → **New Project**: `sadikov-kamal-prod`, region **Frankfurt** (closest to UZ).
2. Copy the **pooled** connection string. It looks like
   `postgres://user:password@ep-xxx-pooler.eu-central-1.aws.neon.tech/sadikov_kamal`.
   Use the **pooled** URL on Vercel — serverless functions create many short
   connections; the unpooled URL will run out of slots.
3. (Optional, recommended) Upgrade to **Launch** ($19/mo) once you cross
   ~0.4 GB so PITR backups + no auto-suspend kick in.

### 2. Object storage — Cloudflare R2

1. Cloudflare Dashboard → **R2 Object Storage** → **Create bucket**:
   `sadikov-kamal-uploads` (or your name).
2. In the bucket settings → **Public R2.dev subdomain** → enable. Copy the
   public URL (`https://pub-<hash>.r2.dev`).
3. **R2 → API tokens** → **Create token**:
   - Permission: **Object Read & Write**
   - Specify bucket: `sadikov-kamal-uploads`
   - TTL: forever (no expiry)
4. Copy: Account ID, Access Key ID, Secret Access Key.

### 3. Domain — Cloudflare Registrar

1. Cloudflare → **Domain Registrar** → register `your-domain.com`.
2. DNS is auto-configured in the same dashboard — nothing to do yet.
3. (Skip if registering a `.uz` via uznic.uz — point its nameservers at
   Cloudflare anyway, for the free CDN + DNS.)

### 4. Generate secrets

Run locally:

```bash
openssl rand -hex 32   # SESSION_SECRET
openssl rand -hex 32   # CRON_SECRET
```

Keep both — you'll paste them into Vercel below.

### 5. Vercel project

1. Vercel Dashboard → **Add New Project** → select the GitHub repo.
2. Framework preset: **Next.js** (auto-detected).
3. **Build & Output Settings**:
   - Build Command: `npm run vercel-build` (this runs Drizzle migrations
     before `next build`).
   - Output: leave default.
4. **Environment Variables** — add these for **Production**:

   | Key | Value source |
   |---|---|
   | `DATABASE_URL` | Neon pooled URL (step 1) |
   | `R2_ACCOUNT_ID` | Cloudflare (step 2) |
   | `R2_ACCESS_KEY_ID` | Cloudflare (step 2) |
   | `R2_SECRET_ACCESS_KEY` | Cloudflare (step 2) |
   | `R2_BUCKET_NAME` | `sadikov-kamal-uploads` |
   | `R2_PUBLIC_URL` | `https://pub-<hash>.r2.dev` |
   | `SESSION_SECRET` | step 4 |
   | `CRON_SECRET` | step 4 |

5. **Deploy** — first build runs migrations against the empty Neon DB.

### 6. First admin user

Run locally (one time only):

```bash
SEED_ADMIN_EMAIL='you@example.com' \
SEED_ADMIN_PASSWORD='use-a-strong-random-password' \
SEED_ADMIN_NAME='Your Name' \
DATABASE_URL='<neon-pooled-url>' \
npm run db:seed:prod
```

The script refuses to run if any user already exists, so re-runs are safe.

### 7. Custom domain

Vercel Project → **Settings → Domains** → add `your-domain.com`.
Vercel shows the CNAME / A record. With Cloudflare DNS, just toggle the
record on (Vercel adds it for you when the domain is registered at
Cloudflare).

SSL provisions automatically within 1–5 minutes.

### 8. Verify

- `https://your-domain.com/api/health` → `{"status":"ok","db":"up",...}`
- `https://your-domain.com/login` → admin login page
- Log in → `/admin` → create one test problem with an image → confirm:
  - Markdown renders
  - Image appears (served from R2)
  - Refresh works

### 9. Manually trigger first backup (sanity check)

Backups are produced by the GitHub Actions workflow
`.github/workflows/db-backup.yml` (daily `pg_dump` → R2). To verify R2
writes work end-to-end, trigger the workflow once by hand:

Actions tab → **Daily DB Backup** → **Run workflow**.

The job uploads `backups/backup-YYYY-MM-DD.sql.gz` to your R2 bucket.

### 10. Monitoring (optional)

- **UptimeRobot** → new monitor → URL = `https://your-domain.com/api/health`
  → check every 5 minutes. Email alert on failure.
- **Sentry** → new Next.js project → follow their wizard → it'll add a
  `SENTRY_DSN` env var.

## Ongoing operations

### Deploying changes

Push to `main` → Vercel auto-deploys → migrations run during build → app
goes live. No manual step required.

### Adding a new migration

```bash
# Make schema changes in src/db/schema/*.ts
npm run db:generate    # creates a new SQL migration in src/db/migrations/
npm run db:migrate     # apply to local dev DB
# Commit and push. Vercel will apply it on prod during next deploy.
```

### Backups

- **Automatic**: every Monday 04:00 UTC, the cron writes a gzipped JSON
  dump to `r2://sadikov-kamal-uploads/backups/`.
- **Pulling backups locally**: see `docs/restore.md`.

### Rotating CRON_SECRET / SESSION_SECRET

1. Generate new value: `openssl rand -hex 32`.
2. Update in Vercel → Environment Variables → save.
3. Redeploy (or trigger a new build) so the function reads the new value.
4. Rotating `SESSION_SECRET` invalidates all live sessions — users must
   log in again. That's intentional after a suspected leak.

## Cost summary

| Scenario | Monthly cost |
|---|---|
| Year 1 (free everywhere) | ~$0 (domain ~$10/yr) |
| When the DB outgrows Neon Free (~0.4 GB) | +$19 (Neon Launch) |
| When traffic outgrows Vercel Hobby | +$20 (Vercel Pro) |
| Full Pro: Vercel + Neon Launch + R2 usage | ~$40–45 |

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Failed query: …` on every page | DB unreachable | Check `DATABASE_URL` in Vercel; if Neon Free, the DB may be auto-suspended (wait 2s and retry) |
| `R2 not configured for backups` | R2 env vars missing | Re-add the five `R2_*` vars in Vercel and redeploy |
| Cron returns 401 | `CRON_SECRET` mismatch | Make sure the value in Vercel matches; Vercel Cron sends the header itself |
| Build fails on migration | Schema drift | Run `npm run db:migrate` locally first to see the actual error |
| `Source not found: imo` on import | Import format vs DB name mismatch | The internal name lookup is case-insensitive — make sure `IMO` exists in `sources` |
