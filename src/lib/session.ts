import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { userDb, type UserDb } from "@/lib/db";

export interface SessionUser {
  id: string;
  email: string;
}

export async function getUser(): Promise<SessionUser | null> {
  // Read the request headers first: that marks the route dynamic before auth() needs runtime secrets.
  const requestHeaders = await headers();
  const session = await auth().api.getSession({ headers: requestHeaders });
  return session ? { id: session.user.id, email: session.user.email } : null;
}

/** Returns the signed-in user and a database handle scoped to them (RLS), or redirects to /login. */
export async function requireUser(): Promise<{ db: UserDb; user: SessionUser }> {
  const user = await getUser();
  if (!user) redirect("/login");
  return { db: userDb(user.id), user };
}
