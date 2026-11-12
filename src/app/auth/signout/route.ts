import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const res = await auth().api.signOut({ headers: request.headers, asResponse: true });
  const redirect = NextResponse.redirect(new URL("/", request.url), { status: 303 });
  // Carry the cleared session cookies over to the redirect.
  for (const cookie of res.headers.getSetCookie()) redirect.headers.append("set-cookie", cookie);
  return redirect;
}
