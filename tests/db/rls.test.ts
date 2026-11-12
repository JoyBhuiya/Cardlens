import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonDb, pool, userDb } from "@/lib/db";
import { createCard, createUser } from "./helpers";

let alice: string;
let bob: string;
let aliceCard: string;

beforeAll(async () => {
  alice = await createUser();
  bob = await createUser();
  aliceCard = await createCard(alice);
});

afterAll(async () => {
  await anonDb.query('delete from "user" where id = any($1)', [[alice, bob]]);
  await pool().end();
});

describe("row-level security", () => {
  it("lets a user read their own rows", async () => {
    const rows = await userDb(alice).query("select id from cards");
    expect(rows.map((r) => r.id)).toEqual([aliceCard]);
  });

  it("hides another user's rows from reads, updates and deletes", async () => {
    const bobDb = userDb(bob);
    expect(await bobDb.query("select id from cards where id = $1", [aliceCard])).toEqual([]);
    expect(await bobDb.query("update cards set issuer = 'x' where id = $1 returning id", [aliceCard])).toEqual([]);
    expect(await bobDb.query("delete from cards where id = $1 returning id", [aliceCard])).toEqual([]);
    const still = await userDb(alice).one<{ issuer: string }>("select issuer from cards where id = $1", [aliceCard]);
    expect(still?.issuer).toBe("Test");
  });

  it("refuses rows written for another user", async () => {
    await expect(userDb(bob).query("insert into cards (user_id, issuer) values ($1, 'Sneaky')", [alice])).rejects.toThrow(/row-level security/);
  });

  it("shows no user rows without a user (anonymous handle)", async () => {
    expect(await anonDb.query("select id from cards")).toEqual([]);
    expect(await anonDb.query("select id from transactions")).toEqual([]);
  });

  it("does not leak app.user_id between pooled connections", async () => {
    await userDb(alice).query("select 1");
    const row = await anonDb.one<{ uid: string | null }>("select app.current_user_id() as uid");
    expect(row?.uid).toBeNull();
  });

  it("keeps system categories read-only", async () => {
    const aliceDb = userDb(alice);
    expect((await aliceDb.query("select slug from categories where is_system")).length).toBeGreaterThan(10);
    expect(await aliceDb.query("delete from categories where slug = 'groceries' returning slug")).toEqual([]);
  });

  it("deleting the user removes all their data (delete-all-my-data)", async () => {
    const carol = await createUser();
    await createCard(carol);
    await userDb(carol).query('delete from "user" where id = $1', [carol]);
    const left = await pool().query("select count(*)::int as n from cards where user_id = $1", [carol]);
    expect(left.rows[0].n).toBe(0);
  });
});
