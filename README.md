# Provia

Math olympiad problem database for Uzbekistan. Admin-only CMS for now,
public read access in the future.

The name comes from "prove" + "via" (path) — *the path to proof*.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) + TypeScript + React 19 |
| Database | PostgreSQL 16 |
| ORM | Drizzle ORM |
| Auth | Custom session-based (bcrypt + DB-revocable tokens) |
| Storage | Cloudflare R2 (S3-compatible) |
| UI | Tailwind CSS v4 + shadcn/ui (base-nova style) |
| Math rendering | KaTeX (server-rendered) |
| Markdown editor | CodeMirror 6 |
| Hosting | Vercel (app), Neon (production DB) |

## Local development

### Prerequisites

- Node.js 20+
- Docker Desktop (for the local Postgres)
- A Cloudflare R2 bucket — see [`docs/r2-setup.md`](docs/r2-setup.md)

### First-time setup

```bash
git clone https://github.com/sadikovkamal/provia
cd provia
npm install
cp .env.example .env.local        # then fill in DATABASE_URL + R2 creds
docker compose up -d              # local Postgres on port 5434
npm run db:migrate                # apply schema
npm run db:seed                   # admin@example.com / ChangeMe123! + reference data
npm run dev
```

Visit `http://localhost:3001/login` (Next picks 3001 because 3000 is
typically taken on the dev machine).

### Useful commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start dev server (Turbopack) |
| `npm run db:studio` | Browse the DB in a web UI (https://local.drizzle.studio) |
| `npm run db:generate` | Generate a migration after editing `src/db/schema/*.ts` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Seed reference data (idempotent on email) |
| `npx tsc --noEmit` | Typecheck the whole project |

### Smoke tests

Each phase ships one or more `scripts/<area>-smoke.ts` that exercise
the new surface end-to-end. Run the whole suite (17 scripts) with:

```bash
npm run smoke
```

The runner (`scripts/run-all-smokes.sh`) splits scripts into two flag
groups: those that import `"server-only"`-marked lib modules need
`--conditions=react-server` so Node resolves the no-op stub instead of
the throw-on-import default; the markdown server-render smoke uses
`react-dom/server` and MUST run without that flag (the conditions are
mutually exclusive).

| Script | Phase | What it covers |
|---|---|---|
| `auth-smoke.ts` | 2 | sessions, bcrypt |
| `auth-http-smoke.ts` | 2 | proxy guard + SSR |
| `markdown-smoke.ts` | 3 | KaTeX + GFM + sanitize |
| `preview-smoke.ts` | 3 | sandbox page |
| `r2-smoke.ts` | 4 | upload roundtrip (no-env mode also covered) |
| `upload-page-smoke.ts` | 4 | upload page shell |
| `problems-smoke.ts` | 5 | problem CRUD + tag dedup |
| `problems-page-smoke.ts` | 5 | pages + 404 |
| `list-smoke.ts` | 6 | list query, filters, EXPLAIN-checked FTS |
| `list-page-smoke.ts` | 6 | list page URL state |
| `import-smoke.ts` | 8 | bulk import happy path |
| `import-page-smoke.ts` | 8 | import pages |
| `import-failure-smoke.ts` | 8 | broken bundle |
| `taxonomy-smoke.ts` | 9 | taxonomy CRUD + tag merge |
| `taxonomy-pages-smoke.ts` | 9 | pages |
| `rate-limit-smoke.ts` | 10 | login rate limit + purge |
| `cron-smoke.ts` | 10 | cron auth gate |

## Deployment

Pushed to `main` auto-deploys via Vercel. Production runtime requires
these env vars in Vercel project settings:

```
DATABASE_URL                  # Neon connection string
R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME    # only used by db:seed
CRON_SECRET                   # bearer token for /api/cron/* routes
```

Cron jobs (Vercel Cron, defined in `vercel.json`):

| Path | Schedule | Purpose |
|---|---|---|
| `/api/cron/cleanup-sessions` | `0 3 * * *` | Drop expired session rows |
| `/api/cron/cleanup-login-attempts` | `0 5 * * *` | Drop login_attempts older than 24h |

> Image upload prefixes — `problems/draft/` (new) and `problems/{id}/`
> (edit) — are never auto-cleaned. Saved problems' markdown bodies still
> reference draft URLs after save (we don't re-key on save), so any cron
> sweeping `draft/` would cause data loss. R2 storage is cheap; orphan
> images from abandoned drafts cost about $0.015/GB indefinitely.
> Proper cleanup would re-key images at save time — out of scope for MVP.

Daily DB backup runs from a GitHub Actions workflow
(`.github/workflows/db-backup.yml`) at 02:00 UTC and uploads a
gzipped `pg_dump` to `R2_BUCKET_NAME/backups/`. See `docs/admin-guide.md`
for the GitHub secrets required.

## Documentation

| Doc | What |
|---|---|
| [`docs/format-spec.md`](docs/format-spec.md) | Bulk-import bundle format (v1) — source of truth for the importer |
| [`docs/ai-import-prompt.md`](docs/ai-import-prompt.md) | LLM prompt that converts PDFs/web pages into the v1 format |
| [`docs/admin-guide.md`](docs/admin-guide.md) | Day-to-day operations: how to add problems, manage taxonomy, restore backups |
| [`docs/r2-setup.md`](docs/r2-setup.md) | Cloudflare R2 bucket setup — bucket, public URL, API token |
| [`docs/examples/`](docs/examples/) | Reference bundles used by the importer smoke tests |

## Plan / phase docs

Provia was built in 10 phases, each with its own design doc in the
repo root (`phase-00-project-skeleton.md` through
`phase-10-polish-and-production.md`). They describe the intent and
acceptance criteria for each layer; the actual implementation diverges
in places (notes in each phase's commit message).

## Future expansion

The schema is intentionally generous so post-MVP features can land
without migrations:

- Student accounts (extend `users.role` enum)
- "Solved" tracking (new `attempts` table)
- Courses → lessons → lesson problems
- Discussions on problems
- Public read mode (problems visible without admin guard)
- Semantic similar-problem search (pgvector)

The `problems.metadata` JSONB column is the escape hatch for one-off
fields you don't want a migration for.

## License

Private.
