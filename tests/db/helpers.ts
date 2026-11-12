import { randomUUID } from "node:crypto";
import { anonDb, userDb } from "@/lib/db";

/** Creates a user the way Better Auth would (the app role may write the user table). */
export async function createUser(): Promise<string> {
  const row = await anonDb.one<{ id: string }>(
    `insert into "user" (name, email, "emailVerified") values ('', $1, true) returning id`,
    [`t-${randomUUID()}@example.com`],
  );
  return row!.id;
}

export async function createCard(userId: string): Promise<string> {
  const row = await userDb(userId).one<{ id: string }>("insert into cards (user_id, issuer) values ($1, 'Test') returning id", [userId]);
  return row!.id;
}
