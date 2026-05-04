# Cloudflare R2 setup

What you need before the app can store images: an R2 bucket, public
read access, and an API token scoped to that bucket only.

## 1. Create a bucket

1. Sign in at https://dash.cloudflare.com.
2. Sidebar → **R2 Object Storage** → **Create bucket**.
3. Name: `provia-uploads` (or anything unique within your account).
4. Location: Automatic.
5. Default storage class: Standard.
6. **Create bucket**.

If R2 isn't enabled yet, Cloudflare prompts you to subscribe. The free
tier is enough for MVP (10 GB storage / 1M Class A ops / 10M Class B ops
per month) — pick "Continue" without entering a card if you can.

## 2. Enable public read access

In the bucket → **Settings** → scroll to **Public Development URL** →
**Enable**. Cloudflare gives you a URL like:

```
https://pub-XXXXXXXXXXXXXXXX.r2.dev
```

That's `R2_PUBLIC_URL`. Save it.

> The `pub-*.r2.dev` domain is throttled by Cloudflare and not meant
> for production traffic. For real launches, attach a custom domain
> (`assets.yourdomain.com`) under **Custom Domains** in the same
> Settings panel. DNS for that domain must be on Cloudflare.

## 3. Find your Account ID

The bucket Settings page also shows the **S3 API** endpoint. It looks
like:

```
https://<account-id>.r2.cloudflarestorage.com/provia-uploads
```

The subdomain is your `R2_ACCOUNT_ID` (32 hex characters).

## 4. Create an API token

R2 dashboard → **Manage R2 API Tokens** → **Create API token**.

| Field | Value |
|---|---|
| Token name | `provia-app` |
| Permissions | **Object Read & Write** (the second of three options) |
| Specify bucket(s) | **Apply to specific buckets only** → select `provia-uploads` |
| TTL | Forever |
| Client IP filtering | (leave empty) |

Click **Create API Token**. Cloudflare shows the secret **once**:

- **Access Key ID** → `R2_ACCESS_KEY_ID`
- **Secret Access Key** → `R2_SECRET_ACCESS_KEY`

Copy both into your password manager AND your `.env.local` before
closing the page. If you lose the secret, rotate by creating a new
token.

## 5. Fill in `.env.local`

```env
R2_ACCOUNT_ID=<32 hex chars from step 3>
R2_ACCESS_KEY_ID=<from step 4>
R2_SECRET_ACCESS_KEY=<from step 4>
R2_BUCKET_NAME=provia-uploads
R2_PUBLIC_URL=https://pub-XXXXXXXXXXXXXXXX.r2.dev
```

## 6. Verify

```bash
NODE_OPTIONS="--conditions=react-server" npx tsx scripts/r2-smoke.ts
```

A successful run uploads a 67-byte 1×1 PNG, fetches it back via the
public URL, and deletes it — all roundtrip in under a second. Output:

```
R2 config status: ready=true, missing=[]
pass: uploaded test/smoke/...png (67 bytes)
pass: fileExists=true after upload
pass: public URL returns 67 bytes
pass: deleteFile completed
pass: fileExists=false after delete
R2 smoke (live roundtrip): PASSED
```

## 7. Mirror to Vercel

For the deployed app, add the same five env vars in:

Vercel project → **Settings** → **Environment Variables** → add for
**Production**, **Preview**, and **Development**.

After adding, trigger a redeploy (push a commit, or **Deployments**
→ latest → **Redeploy**). Until those env vars exist on Vercel, the
app's R2 helpers throw a clear "R2 storage is not configured" error
on first call (module load still succeeds — see
`src/lib/storage/r2.ts`'s lazy validation).
