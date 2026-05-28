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
    // Prefer AVIF (20% smaller than WebP) with WebP as fallback for older
    // browsers. Next.js negotiates via the Accept header automatically.
    formats: ["image/avif", "image/webp"],
  },

  // These packages use Node.js-native APIs (native bindings / C++ addons) and
  // must not be bundled by the App Router RSC bundler. postgres uses a custom
  // native TLS path; bcryptjs ships a native binding via node-pre-gyp; sharp
  // ships platform-specific libvips binaries that Webpack would otherwise
  // try (and fail) to bundle.
  serverExternalPackages: ["postgres", "bcryptjs", "sharp"],

  // Security headers applied at the Next.js layer so they are present for
  // ALL runtimes (next start, Docker, Vercel). The vercel.json headers
  // duplicate a subset of these for CDN-edge delivery, but the Next.js layer
  // is the authoritative source.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            // Content-Security-Policy
            // - default-src 'self': block unexpected origins by default
            // - script-src 'self' 'unsafe-inline': Next.js inline scripts
            //   (hydration, Font Optimization) require unsafe-inline;
            //   upgrade to a nonce-based CSP once the team adds nonce support.
            // - style-src 'self' 'unsafe-inline': Tailwind/inline styles
            // - img-src 'self' data: blob: https:: local images + R2
            // - font-src 'self': Next.js font optimization serves from origin
            // - connect-src 'self' + R2 S3 endpoint: API routes, plus the
            //   browser's direct presigned-PUT upload of large import ZIPs
            //   to Cloudflare R2 (bypasses Vercel's 4.5 MB body limit).
            //   The wildcard is safe — presigned URLs are signature-gated;
            //   CSP only governs which origins the page may talk to.
            // - frame-ancestors 'none': belt-and-suspenders with X-Frame-Options
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self'",
              "connect-src 'self' https://*.r2.cloudflarestorage.com",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
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
