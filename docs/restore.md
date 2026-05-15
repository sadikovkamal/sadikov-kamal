# Restore from backup

Steps for the day a backup actually needs to come back. Practice this
end-to-end at least once before you need it.

## Where backups live

Three layers, smallest scope first:

1. **Neon PITR** — point-in-time recovery within the last 7 days (Launch
   plan and up). Use the Neon console. Free tier does not include PITR.
2. **R2 daily dumps** — `r2://<R2_BUCKET_NAME>/backups/backup-YYYY-MM-DD.sql.gz`,
   produced every day 02:00 UTC by the GitHub Actions workflow
   `.github/workflows/db-backup.yml` (gzipped `pg_dump`). 30 daily
   snapshots are kept; older files are pruned by the same workflow.
3. **Your local mirror** — pull from R2 to `D:\Backups\sadikov-kamal\` monthly
   (or any cadence you like).

## Pulling backups from R2 to your machine

Use [rclone](https://rclone.org). One-time setup:

```bash
rclone config
# n) New remote
# name> cloudflare-r2
# Storage> s3
# provider> Cloudflare
# access_key_id> <R2_ACCESS_KEY_ID>
# secret_access_key> <R2_SECRET_ACCESS_KEY>
# endpoint> https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
# region> auto
```

Then any time:

```bash
rclone sync cloudflare-r2:<R2_BUCKET_NAME>/backups D:\Backups\sadikov-kamal\
```

`sync` only downloads new files and skips ones you already have.

## Inspecting a backup

Each file is a gzipped SQL dump produced by `pg_dump --no-owner
--no-privileges`. To peek without restoring:

```bash
gunzip -c backup-2026-05-04.sql.gz | head -200
```

To count `INSERT` / `COPY` statements per table:

```bash
gunzip -c backup-2026-05-04.sql.gz \
  | grep -E '^(COPY|INSERT INTO) public\.' \
  | awk '{print $2 " " $3}' | sort | uniq -c
```

## Restoring into a fresh database

The dump is a plain SQL file — `psql` can replay it directly. Do **not**
restore over a populated DB; restore into a fresh, empty target.

### 1. Set up a fresh DB

Anywhere you like — a new Neon project, a Hetzner VPS, your laptop. As
long as you have a `DATABASE_URL` pointing at an empty Postgres.

### 2. Decompress and restore

```bash
gunzip -k backup-2026-05-04.sql.gz
psql "$RESTORE_TARGET_URL" < backup-2026-05-04.sql
```

The dump includes `CREATE TABLE`, indexes, constraints, and data — no
separate migration step is needed.

### 3. Point the app at the restored DB

Update `DATABASE_URL` in Vercel → Settings → Environment Variables, save,
redeploy. Or for a local check: update `.env.local` and `npm run dev`.

### 4. Smoke test

- `npm run smoke` (problems + taxonomy smoke scripts)
- Log into the admin and confirm a known problem is present
- Spot-check images load (they're still in R2, untouched by DB restore)

## Recovering from a specific failure

| Failure | Use | Why |
|---|---|---|
| Accidental `DELETE FROM problems` 10 min ago | Neon PITR | Point-in-time recovery to 11 min ago, single command in Neon console |
| Migration broke prod | Vercel rollback to previous deploy | Restores both code and runs the previous build's migration set (Drizzle is forward-only — actual schema rollback may need a hand-written DOWN migration) |
| Neon project deleted / suspended | R2 daily backup | Restore most recent dump into a new Neon project / Hetzner Postgres |
| Lost everything except your laptop | Local `D:\Backups\sadikov-kamal\` | The whole `backup-YYYY-MM-DD.sql.gz` mirror you've been keeping |

## Verifying backups (do this every quarter)

Set yourself a recurring calendar reminder:

1. Spin up a throwaway Postgres locally:
   ```bash
   docker run --rm -d -p 5435:5432 -e POSTGRES_PASSWORD=test postgres:17-alpine
   ```
2. Restore the latest backup into it (steps above).
3. Connect with `psql` and run a few sanity counts:
   ```sql
   SELECT count(*) FROM problems;
   SELECT count(*) FROM topics;
   ```
4. Numbers should match production. If they don't — the backup is
   broken and you need to investigate before relying on it.
5. Stop the throwaway container: `docker stop <id>`.

This drill is the single most valuable habit. Backups that have never
been restored are not backups.
