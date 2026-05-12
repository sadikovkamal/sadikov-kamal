# Admin Guide

Operational manual for the humans running Provia. If you're a
developer, read `README.md` first; this doc assumes the app is already
deployed and you're managing day-to-day content.

---

## Logging in

- Production: `https://<your-domain>/login`
- Local dev: `http://localhost:3001/login`

Initial credentials: whatever you set as `SEED_ADMIN_EMAIL` /
`SEED_ADMIN_PASSWORD` when running `npm run db:seed` against the
production DB. Store them in a password manager — there is no email
recovery flow.

### Rate limit

After 5 failed attempts within 15 minutes, login is blocked for that
IP address AND for that email until the window expires. To unlock
immediately, an operator with DB access can run:

```sql
DELETE FROM login_attempts WHERE identifier = 'ip:<your-ip>';
DELETE FROM login_attempts WHERE identifier = 'email:<your-email>';
```

The `cleanup-login-attempts` cron also clears the table once a day.

---

## Adding problems

### One at a time

1. Navigate to `/admin/problems/new`.
2. Fill in the metadata: source, year, problem number, classes (5–11),
   topics.
3. Write the problem in Markdown in the left editor:
   - Inline math: `$f(x) = x^2$`
   - Display math: `$$\int_0^1 x \, dx = \tfrac12$$`
   - GFM tables, task lists, and code blocks all work.
4. Drag images into the editor — they upload to R2 and the markdown
   reference (`![filename](public-url)`) is inserted at the cursor.
5. Switch to the **Yechim** tab to add a solution (optional).
6. Click **Yaratish**. You're redirected to `/admin/problems/{id}`.

### In bulk (recommended for olympiad PDFs)

1. Get the source: PDF, scanned book pages, web-page text.
2. Open Claude or ChatGPT in a fresh chat.
3. Copy the prompt from `docs/ai-import-prompt.md`.
4. Paste the source material under the prompt and send.
5. The AI returns a `problems.md` file. Save it to a new folder, e.g.:

   ```
   imo-2024/
   ├── problems.md
   └── images/
       ├── imo-2024-p1-fig1.png
       └── imo-2024-p3-fig1.png
   ```

6. Add an optional `manifest.yaml` with batch-wide defaults:

   ```yaml
   batch_name: "IMO 2024"
   defaults:
     source: imo
     year: 2024
   ```

7. Zip the folder. **Use Python or 7-zip on Windows** — Windows'
   `Compress-Archive` produces backslash-separated paths that the
   Linux importer can't read. Reference command:

   ```bash
   python -c "
   import zipfile, os
   with zipfile.ZipFile('imo-2024.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
       for root, _, files in os.walk('imo-2024'):
           for f in files:
               full = os.path.join(root, f)
               arc = os.path.relpath(full, 'imo-2024').replace(os.sep, '/')
               zf.write(full, arc)
   "
   ```

8. Go to `/admin/import` → upload the ZIP → **Tekshirish**.
9. Review the per-problem report. Errors must be fixed in the source
   markdown (re-zip and re-upload). Warnings about auto-creating
   sources/topics are normal.
10. **{N} ta masalani import qilish** → wait for the redirect to the
    batch page. Successes show up in `/admin/problems`.

### Rules of thumb

- Keep batches under 50 problems for review-ability. The hard cap is
  200 / 50 MB per the format spec.
- **Always Tekshirish before Import.** Errors at validation time are
  cheap; errors at execute time leave a partially-imported batch that
  has to be cleaned up by hand.
- Duplicates (same `source` + `year` + `problem_number`) are skipped
  automatically and noted in the batch's error log.
- Auto-created sources and topics get a slug-derived display name
  ("imo-shortlist" → "Imo Shortlist"). Rename them in `/admin/sources`
  and `/admin/topics` after the import completes.

### Format spec quick reference

See `docs/format-spec.md` for the full version. The frontmatter
contract:

```yaml
source: imo                    # slug; auto-created if missing
year: 2024                     # int 1900..2100, optional
problem_number: "P3"           # string, required
classes: [10, 11]              # int 5..11, at least one
topics: [algebra, geometry]    # slug list, at least one
answer: "x = 3"                # optional, for non-proof problems
```

Every problem must have a `# Shart` heading. `# Yechim` is optional.

---

## Managing taxonomy

### Topics (`/admin/topics`)

Hierarchical. Topics auto-created during bulk import are roots — go
into `/admin/topics` afterward, click **Tahrirlash** on the new topic,
and pick a parent if it should nest.

Deleting a topic with associated problems is blocked (FK restrict);
the UI surfaces "O'chirib bo'lmadi: bu mavzuga bog'liq masalalar
bor". Reassign or delete the problems first.

### Sources (`/admin/sources`)

Flat list. The kind enum (`olympiad`, `book`, `course`, `other`) is
mostly for filtering on a future public site; pick a sane value but
don't agonize. The `country` field is also a hint — set "UZ" for
Uzbek olympiads.

Same FK-restrict behavior as topics.

---

## Backups

Daily at 02:00 UTC, the GitHub Actions workflow at
`.github/workflows/db-backup.yml`:

1. Runs `pg_dump --no-owner --no-privileges` against `PROD_DATABASE_URL`.
2. Gzips the dump.
3. Uploads to `R2_BUCKET_NAME/backups/backup-YYYY-MM-DD.sql.gz`.
4. Prunes backups older than 30 days.

Required GitHub secrets in **Settings → Secrets and variables →
Actions**:

| Secret | Value |
|---|---|
| `PROD_DATABASE_URL` | The Neon connection string |
| `R2_ACCOUNT_ID` | Same as Vercel env |
| `R2_ACCESS_KEY_ID` | Same |
| `R2_SECRET_ACCESS_KEY` | Same |
| `R2_BUCKET_NAME` | Same |

To trigger a manual run: Actions tab → "Daily DB Backup" → **Run
workflow**.

### Restoring from a backup

```bash
# 1. Download the dump from R2 (any S3-compatible CLI):
aws s3 cp \
  "s3://$R2_BUCKET_NAME/backups/backup-2026-05-04.sql.gz" \
  ./backup.sql.gz \
  --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"

# 2. Decompress
gunzip backup.sql.gz

# 3. Restore into a fresh DB (do NOT restore over a populated DB)
psql "$RESTORE_TARGET_URL" < backup.sql
```

Test the restore process at least once after setting it up — a backup
you've never restored from might not work.

---

## Cron jobs

Vercel runs two cron jobs from `vercel.json`. Each is gated by
`CRON_SECRET` (a long random string set as a Vercel env var):

| Cron | Schedule | Effect |
|---|---|---|
| `/api/cron/cleanup-sessions` | `0 3 * * *` | Removes `sessions` rows where `expires_at < now()` |
| `/api/cron/cleanup-login-attempts` | `0 5 * * *` | Removes `login_attempts` rows older than 24h |

> R2 has no auto-cleanup cron. Single-problem editor uploads under
> `problems/draft/` are referenced by saved problems' markdown bodies
> (we don't re-key images on save), so any cron that swept the prefix
> would cause data loss. Orphan images from abandoned drafts accumulate
> at ~$0.015/GB on R2 — negligible at MVP scale.

Manual run for testing:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://<your-domain>/api/cron/cleanup-sessions
```

Without the bearer token: 401. Without `CRON_SECRET` configured at
all on the server: 503.

---

## Common issues

**"Image not loading after publish"** — R2 propagation can take a few
seconds. If the URL persists in returning 404, check the public URL
in the markdown matches an actual object in the bucket
(`/admin/test/upload` is a quick way to verify R2 itself is healthy).

**"Bulk import says 'duplicate'"** — A problem with the same
`(source, year, problem_number)` already exists. The importer skips
it automatically and notes it in the batch's error log. To replace
the existing problem instead, delete it via `/admin/problems/{id}`
first then re-import.

**"Login locked out"** — wait 15 minutes, or clear `login_attempts`
via the SQL snippet above.

**"Server action exceeded 1 MB / 4.5 MB body"** — Vercel caps server
action payloads at ~4.5 MB on Hobby/Pro tiers. The local dev limit is
50 MB (see `next.config.ts`'s `experimental.serverActions.bodySizeLimit`).
For production bundles over 4.5 MB, split them.

**"Sentry quota exceeded"** — if you wired up Sentry, the free tier
caps at 5K events/month. Add `beforeSend` filters in
`sentry.server.config.ts` to drop expected errors (zod validation
errors in actions are a common culprit).

---

## Going further

When the time comes:

- **Public read access** — add a `/problems` route without
  `requireAdmin()` so visitors can browse the catalog with solutions
  hidden until clicked.
- **Student accounts** — extend `users.role` enum, add `attempts`
  table, "Mark as solved" button.
- **Audit log** — record every create/update/delete on `problems` if
  multiple admins start writing.
- **Custom R2 domain** — `assets.yourdomain.com` removes the rate
  limit on `pub-*.r2.dev`. Plan migration of existing markdown URLs
  before doing this — see `phase-10-polish-and-production.md`.
