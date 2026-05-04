// Next.js 16: this file used to be called `middleware.ts`.
// The convention was renamed to `proxy.ts` and the exported function to `proxy`.
// See: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/tokens";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only guard /admin/*
  if (!pathname.startsWith("/admin")) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // The proxy can't talk to the DB (Edge runtime, no postgres-js).
  // It only checks "is there a cookie?". Real validation happens in
  // server components via requireAdmin(). Defense in depth, not the
  // only line of defense.
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
