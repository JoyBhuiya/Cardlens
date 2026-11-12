import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonDb, pool, userDb } from "@/lib/db";
import { LimitError, aiMeter, assertUploadAllowance, recordUpload, takeRateLimit } from "@/lib/usage";
import { createUser } from "./helpers";

let user: string;

beforeAll(async () => {
  user = await createUser();
});

afterAll(async () => {
  await anonDb.query('delete from "user" where id = $1', [user]);
  await pool().end();
});

describe("upload allowance", () => {
  it("refuses uploads past the daily limit", async () => {
    process.env.UPLOADS_PER_DAY = "2";
    const db = userDb(user);
    await assertUploadAllowance(db, user);
    await recordUpload(db, user);
    await recordUpload(db, user);
    await expect(assertUploadAllowance(db, user)).rejects.toBeInstanceOf(LimitError);
    delete process.env.UPLOADS_PER_DAY;
  });

  it("cannot be reset by the app: the ledger is append-only", async () => {
    await expect(userDb(user).query("delete from usage_events where user_id = $1", [user])).rejects.toThrow(/permission denied/);
    await expect(userDb(user).query("update usage_events set kind = 'upload' where user_id = $1", [user])).rejects.toThrow(/permission denied/);
  });
});

describe("AI allowance", () => {
  it("records tokens and refuses past the per-user monthly cap", async () => {
    process.env.AI_CALLS_PER_USER_MONTH = "1";
    const meter = aiMeter(userDb(user), user, "extract");
    await meter.before();
    await meter.after("claude-test", { input_tokens: 1200, output_tokens: 300 });
    await expect(meter.before()).rejects.toThrow(/processing limit/);
    const row = await userDb(user).one<{ input_tokens: number; output_tokens: number }>(
      "select input_tokens, output_tokens from usage_events where user_id = $1 and kind = 'ai_call'",
      [user],
    );
    expect(row).toEqual({ input_tokens: 1200, output_tokens: 300 });
    delete process.env.AI_CALLS_PER_USER_MONTH;
  });

  it("refuses everyone once the global daily cap is reached", async () => {
    process.env.AI_CALLS_PER_DAY = "1"; // the call recorded above already uses it
    const other = await createUser();
    await expect(aiMeter(userDb(other), other, "summary").before()).rejects.toThrow(/busy/);
    await anonDb.query('delete from "user" where id = $1', [other]);
    delete process.env.AI_CALLS_PER_DAY;
  });
});

describe("waitlist", () => {
  it("accepts a repeat sign-up silently and never lets the app read the list", async () => {
    const email = `w-${randomUUID()}@example.com`;
    const sql = "insert into waitlist (email, segment, cards, source) values ($1, 'personal', null, 'landing') on conflict do nothing";
    await anonDb.query(sql, [email]);
    await anonDb.query(sql, [email]);
    await expect(anonDb.query("select email from waitlist")).rejects.toThrow(/permission denied/);
  });
});

describe("anonymous rate limit", () => {
  it("allows the limit within a window, then refuses", async () => {
    const key = `test:${randomUUID()}`;
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await takeRateLimit(key, 3, 3600));
    expect(results).toEqual([true, true, true, false]);
  });
});
