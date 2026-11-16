import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const sent: { to: string; subject: string }[] = [];
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn(async (m: { to: string; subject: string }) => void sent.push(m)) }));

const { anonDb, userDb } = await import("@/lib/db");
const { housekeeping, sweepAccounts, sweepFiles, touchUser } = await import("@/lib/retention");
const { saveFile } = await import("@/lib/storage");
const { createCard, createUser } = await import("./helpers");

const cfg = { inactiveMonths: 13, warningDays: 30, leftoverFileDays: 7, keptFileDays: 90 };
const DAY = 86_400_000;

async function emailOf(id: string) {
  return (await anonDb.one<{ email: string }>(`select email from "user" where id = $1`, [id]))!.email;
}
async function setActive(id: string, at: Date) {
  await anonDb.query(`update "user" set last_active_at = $2, retention_warned_at = null where id = $1`, [id, at.toISOString()]);
}
async function exists(id: string) {
  return (await anonDb.query(`select 1 from "user" where id = $1`, [id])).length === 1;
}

describe("inactive accounts", () => {
  const now = new Date();
  const longAgo = new Date(now.getTime() - 400 * DAY); // ~13.1 months
  let idle: string, paying: string, back: string;

  beforeAll(async () => {
    idle = await createUser();
    paying = await createUser();
    back = await createUser();
    for (const u of [idle, paying, back]) await setActive(u, longAgo);
    await userDb(paying).query(
      `insert into entitlements (user_id, plan, status, source, current_period_end) values ($1, 'side_business', 'active', 'manual', now() + interval '200 days')`,
      [paying],
    );
  });

  it("warns once by email, then deletes only after the warning period", async () => {
    sent.length = 0;
    const first = await sweepAccounts(now, cfg);
    expect(sent.map((m) => m.to)).toContain(await emailOf(idle));
    expect(sent.map((m) => m.to)).not.toContain(await emailOf(paying));
    expect(first.warned).toBeGreaterThanOrEqual(2); // idle + back
    // A second run straight away neither re-sends nor deletes.
    sent.length = 0;
    const again = await sweepAccounts(now, cfg);
    expect(again).toEqual({ warned: 0, deleted: 0 });
    expect(await exists(idle)).toBe(true);

    // "back" signs in during the warning period.
    await touchUser(anonDb, back);

    const later = new Date(now.getTime() + 31 * DAY);
    await sweepAccounts(later, cfg);
    expect(await exists(idle)).toBe(false);
    expect(await exists(back)).toBe(true);
    expect(await exists(paying)).toBe(true);
  });

  afterAll(async () => {
    for (const u of [paying, back]) await anonDb.query(`delete from "user" where id = $1`, [u]);
  });
});

describe("leftover statement files", () => {
  let user: string;
  let card: string;
  beforeAll(async () => {
    user = await createUser();
    card = await createCard(user);
  });

  async function statement(status: string, keep: boolean, ageDays: number) {
    const filePath = `${user}/${randomUUID()}.csv`;
    await saveFile(user, filePath, new TextEncoder().encode("Date,Description,Amount\n"));
    // The touch trigger only fires on update, so the age can be set on insert.
    const row = await userDb(user).one<{ id: string }>(
      `insert into statements (user_id, card_id, file_path, file_name, file_type, keep_file, status, updated_at)
       values ($1, $2, $3, 'x.csv', 'csv', $4, $5, now() - make_interval(days => $6)) returning id`,
      [user, card, filePath, keep, status, ageDays],
    );
    return { id: row!.id, filePath };
  }

  it("removes failed files after 7 days and kept files after 90, nothing younger", async () => {
    const oldFailed = await statement("failed", false, 8);
    const newFailed = await statement("needs_review", false, 2);
    const oldKept = await statement("parsed", true, 91);
    const newKept = await statement("parsed", true, 10);
    await sweepFiles(cfg);
    const root = process.env.STORAGE_DIR!;
    const onDisk = (p: string) => existsSync(path.join(root, p));
    expect(onDisk(oldFailed.filePath)).toBe(false);
    expect(onDisk(oldKept.filePath)).toBe(false);
    expect(onDisk(newFailed.filePath)).toBe(true);
    expect(onDisk(newKept.filePath)).toBe(true);
    const rows = await userDb(user).query<{ id: string; file_path: string | null }>(`select id, file_path from statements`);
    expect(rows.find((r) => r.id === oldFailed.id)!.file_path).toBeNull();
    expect(rows.find((r) => r.id === newKept.id)!.file_path).not.toBeNull();
  });

  afterAll(async () => {
    await anonDb.query(`delete from "user" where id = $1`, [user]);
  });
});

describe("housekeeping", () => {
  it("removes expired sign-in codes and old rate-limit windows", async () => {
    await anonDb.query(`insert into verification (identifier, value, "expiresAt") values ('sign-in-otp-x@example.com', 'h', now() - interval '3 days')`);
    await anonDb.query(`insert into rate_limits (key, window_start, hits) values ('test:old', now() - interval '5 days', 1)`);
    expect(await housekeeping()).toBeGreaterThanOrEqual(2);
    expect(await anonDb.query(`select 1 from rate_limits where key = 'test:old'`)).toEqual([]);
  });
});
