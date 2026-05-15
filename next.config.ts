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
    // Vercel caps server-action bodies at ~4.5 MB on Hobby/Pro tiers — going
    // above that is meaningless in production (the platform rejects with 413
    // before our handler runs). Keep the framework limit honest so dev
    // matches prod: bundles larger than this need to be split or uploaded
    // through a presigned-PUT path instead of a server action.
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
