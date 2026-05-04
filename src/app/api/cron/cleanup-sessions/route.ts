import { NextResponse } from "next/server";
import { purgeExpiredSessions } from "@/lib/auth";
import { verifyCron } from "../_helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = verifyCron(request);
  if (unauthorized) return unauthorized;

  await purgeExpiredSessions();
  return NextResponse.json({ ok: true, job: "cleanup-sessions" });
}
