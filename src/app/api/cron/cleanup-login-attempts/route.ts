import { NextResponse } from "next/server";
import { purgeOldLoginAttempts } from "@/lib/auth";
import { verifyCron } from "../_helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = verifyCron(request);
  if (unauthorized) return unauthorized;

  let deleted = 0;
  try {
    deleted = await purgeOldLoginAttempts();
  } catch (e) {
    console.error("[cron] cleanup-login-attempts failed:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, job: "cleanup-login-attempts", deleted });
}
