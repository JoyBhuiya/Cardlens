import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { userDb } from "@/lib/db";
import { getUser } from "@/lib/session";

export const runtime = "nodejs";

const Ids = z.array(z.string().uuid()).min(1).max(50);

export interface StatementStatusRow {
  id: string;
  status: "uploaded" | "extracting" | "processing" | "parsed" | "needs_review" | "failed";
  transaction_count: number;
  error: string | null;
}

/** GET ?ids=a,b,c → progress of the signed-in user's statements (RLS: other users' ids return nothing). */
export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in", code: "unauthenticated" }, { status: 401 });
  const ids = Ids.safeParse((request.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean));
  if (!ids.success) return NextResponse.json({ error: "Bad ids", code: "bad_request" }, { status: 400 });

  const rows = await userDb(user.id).query<StatementStatusRow>(
    "select id, status, transaction_count, error from statements where id = any($1::uuid[])",
    [ids.data],
  );
  return NextResponse.json({ statements: rows }, { headers: { "Cache-Control": "no-store" } });
}
