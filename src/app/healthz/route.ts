import { NextResponse } from "next/server";
import { anonDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Liveness for deploy smoke checks and the container healthcheck: the app answers and reaches Postgres. */
export async function GET() {
  try {
    await anonDb.query("select 1");
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("healthz: database unreachable", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Database unreachable", code: "db_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
