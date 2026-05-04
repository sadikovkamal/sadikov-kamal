import type { NextConfig } from "next";

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
  images: {
    remotePatterns: r2Hostname
      ? [{ protocol: "https", hostname: r2Hostname }]
      : [],
  },
};

export default nextConfig;
