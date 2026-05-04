import { NextResponse } from "next/server";

// Never run during build / never cache — always check live DB at request time.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { status: "degraded", db: "down", reason: "DATABASE_URL not set" },
      { status: 503 }
    );
  }

  try {
    // Lazy import so a missing/invalid DATABASE_URL doesn't crash module load
    // for unrelated routes that don't need the DB.
    const { db } = await import("@/db");
    const { sql } = await import("drizzle-orm");
    const result = await db.execute(sql`SELECT 1 as ok, NOW() as time`);
    return NextResponse.json({
      status: "ok",
      db: "up",
      probe: result[0],
    });
  } catch (e) {
    return NextResponse.json(
      {
        status: "degraded",
        db: "down",
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 503 }
    );
  }
}
