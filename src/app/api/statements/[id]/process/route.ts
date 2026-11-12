import { NextResponse } from "next/server";
import { z } from "zod";
import { userDb } from "@/lib/db";
import { enqueueStatement } from "@/lib/jobs";
import { getUser } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Retry: queue a statement for the background worker again (failed, needs review or interrupted). Processing
 * happens outside the request, so long PDFs never hit a proxy timeout. Progress: GET /api/statements/status.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Bad id", code: "bad_request" }, { status: 400 });

  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in", code: "unauthenticated" }, { status: 401 });

  const db = userDb(user.id);
  const st = await db.one<{ status: string }>("select status from statements where id = $1", [id]);
  if (!st) return NextResponse.json({ error: "Statement not found.", code: "not_found" }, { status: 404 });
  if (st.status === "parsed") return NextResponse.json({ error: "This statement is already processed.", code: "done" }, { status: 409 });
  const queued = await enqueueStatement(db, user.id, id);
  if (!queued) {
    return NextResponse.json({ error: "The original file is no longer stored. Upload it again to reprocess.", code: "no_file" }, { status: 409 });
  }
  return NextResponse.json({ queued: true }, { status: 202 });
}
