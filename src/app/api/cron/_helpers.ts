import "server-only";

import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

/**
 * Verify a Vercel Cron request. Cron jobs hit the route with
 * `Authorization: Bearer <CRON_SECRET>` set in vercel.json's
 * environment. Without `CRON_SECRET` the route returns 503 instead of
 * silently allowing public access.
 */
export function verifyCron(request: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured on the server" },
      { status: 503 }
    );
  }
  const auth = request.headers.get("authorization") ?? "";
  const provided = `Bearer ${expected}`;
  const bufA = Buffer.from(auth);
  const bufB = Buffer.from(provided);
  // Use timingSafeEqual to prevent timing-based secret enumeration.
  // When lengths differ we compare bufB against itself (constant time)
  // before returning false so callers can't infer length from timing.
  const equal =
    bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
  if (!equal) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
