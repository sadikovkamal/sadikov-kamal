import "server-only";

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
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
