import type { NextConfig } from "next";
import path from "node:path";

// Allow next/image to load from the configured R2 public URL. We resolve
// the hostname at build/start time; if R2_PUBLIC_URL is unset (e.g. early
// dev before Phase 4 completion) we just skip the entry rather than crash.
const r2PublicUrl = process.env.R2_PUBLIC_URL;
let r2Hostname: string | undefined;
if (r2PublicUrl) {
  try {
    r2Hostname = new URL(r2PublicUrl).hostname;
  } catch {
    console.warn(`R2_PUBLIC_URL is not a valid URL: "${r2PublicUrl}"`);
  }
}

const nextConfig: NextConfig = {
  // Pin Turbopack's workspace root to this directory. Without it, Next sees
  // the parent repo's lockfile (when running from a git worktree under
  // `.claude/worktrees/`) and infers the wrong root, which silently serves
  // routes from the parent worktree — every new route here turns into 404.
  turbopack: {
    root: path.resolve(__dirname),
  },
  images: {
    remotePatterns: r2Hostname
      ? [{ protocol: "https", hostname: r2Hostname }]
      : [],
  },
  experimental: {
    // Default cap is 1 MB, which is below our R2 MAX_SIZE_BYTES (5 MB).
    // Without this, image uploads fail at the Server Action boundary
    // before our handler ever runs. Keep these two limits in sync.
    serverActions: {
      // Image uploads cap at 5 MB (Phase 4) but bulk-import bundles cap at
      // 50 MB (Phase 7 spec). Pick the larger so neither flow is clipped at
      // the framework boundary; per-file/per-bundle validation enforces the
      // real limits with useful error messages.
      // Note: Vercel itself caps server-action payloads around 4.5 MB on
      // Hobby/Pro tiers, so big bundles need to be split for production.
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
