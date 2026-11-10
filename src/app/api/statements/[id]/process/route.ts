import { NextResponse } from "next/server";
import { z } from "zod";
import { processStatement } from "@/lib/pipeline/run";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300; // long statements take ~60s+ for Claude to read; Pro plan allows 300s

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const result = await processStatement(supabase, user.id, id);
  return NextResponse.json(result, { status: result.status === "failed" ? 422 : 200 });
}
