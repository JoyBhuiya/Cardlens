import { NextResponse } from "next/server";
import { z } from "zod";
import { userDb } from "@/lib/db";
import { processStatement } from "@/lib/pipeline/run";
import { getUser } from "@/lib/session";

export const runtime = "nodejs";
// Long statements take 60 s or more for Claude to read. The edge proxy allows 320 s for this route.
export const maxDuration = 300;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Bad id", code: "bad_request" }, { status: 400 });

  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in", code: "unauthenticated" }, { status: 401 });

  const result = await processStatement(userDb(user.id), user.id, id);
  return NextResponse.json(result, { status: result.status === "failed" ? 422 : 200 });
}
