import { NextResponse } from "next/server";
import { purgeOldLoginAttempts } from "@/lib/auth";
import { verifyCron } from "../_helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = verifyCron(request);
  if (unauthorized) return unauthorized;

  const deleted = await purgeOldLoginAttempts();
  return NextResponse.json({ ok: true, job: "cleanup-login-attempts", deleted });
}
