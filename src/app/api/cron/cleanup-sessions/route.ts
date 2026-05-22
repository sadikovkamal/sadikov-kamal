import { NextResponse } from "next/server";
import { purgeExpiredSessions } from "@/lib/auth";
import { verifyCron } from "../_helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = verifyCron(request);
  if (unauthorized) return unauthorized;

  try {
    await purgeExpiredSessions();
  } catch (e) {
    console.error("[cron] cleanup-sessions failed:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, job: "cleanup-sessions" });
}
