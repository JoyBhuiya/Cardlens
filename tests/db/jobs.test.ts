import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Claude is mocked (unknown merchants → "shopping"); the worker runs the real pipeline on Postgres + disk.
vi.mock("@/lib/ai/client", () => ({
  anthropic: () => ({
    messages: {
      parse: vi.fn(async (req: { messages: { content: string }[] }) => {
        const batch = JSON.parse(req.messages[0].content) as { merchant: string }[];
        return { parsed_output: { items: batch.map((b) => ({ merchant: b.merchant, category: "shopping" })) }, usage: { input_tokens: 1, output_tokens: 1 } };
      }),
    },
  }),
}));

const { anonDb, pool, userDb } = await import("@/lib/db");
const { claimJob, enqueueStatement, MAX_JOB_ATTEMPTS } = await import("@/lib/jobs");
const { runJob } = await import("@/lib/worker");
const { saveFile } = await import("@/lib/storage");
const { createCard, createUser } = await import("./helpers");

const CSV = "Date,Description,Amount\n02/03/2026,TESCO STORES 3042,64.32\n10/03/2026,PAYMENT RECEIVED - THANK YOU,-450.00\n";
let user: string;
let card: string;

async function uploaded(): Promise<string> {
  const filePath = `${user}/${randomUUID()}.csv`;
  await saveFile(user, filePath, new TextEncoder().encode(CSV));
  const row = await userDb(user).one<{ id: string }>(
    "insert into statements (user_id, card_id, file_path, file_name, file_type) values ($1, $2, $3, 'x.csv', 'csv') returning id",
    [user, card, filePath],
  );
  return row!.id;
}

beforeAll(async () => {
  await anonDb.query("delete from statement_jobs");
  user = await createUser();
  card = await createCard(user);
});

afterAll(async () => {
  await anonDb.query('delete from "user" where id = $1', [user]);
  await pool().end();
});

describe("background processing queue", () => {
  it("queues an upload, a worker claims it once, and the statement is parsed", async () => {
    const id = await uploaded();
    expect(await enqueueStatement(userDb(user), user, id)).toBe(true);

    const [a, b] = await Promise.all([claimJob(anonDb), claimJob(anonDb)]);
    expect([a, b].filter(Boolean)).toHaveLength(1); // SKIP LOCKED: only one loop gets it
    const job = (a ?? b)!;
    expect(job).toMatchObject({ statement_id: id, user_id: user, attempts: 1 });

    await runJob(job);
    const st = await userDb(user).one<{ status: string; transaction_count: number }>("select status, transaction_count from statements where id = $1", [id]);
    expect(st).toEqual({ status: "parsed", transaction_count: 2 });
    expect((await anonDb.one<{ status: string }>("select status from statement_jobs where statement_id = $1", [id]))?.status).toBe("done");
    expect(await claimJob(anonDb)).toBeNull();
  });

  it("won't queue another user's statement", async () => {
    const id = await uploaded();
    const mallory = await createUser();
    expect(await enqueueStatement(userDb(mallory), mallory, id)).toBe(false);
    expect(await anonDb.one("select 1 from statement_jobs where statement_id = $1", [id])).toBeNull();
    await anonDb.query('delete from "user" where id = $1', [mallory]);
  });

  it("re-claims a job abandoned mid-run (server restart) and gives up after too many attempts", async () => {
    const id = await uploaded();
    await enqueueStatement(userDb(user), user, id);
    await anonDb.query(
      "update statement_jobs set status = 'running', locked_at = now() - interval '11 minutes', attempts = $2 where statement_id = $1",
      [id, MAX_JOB_ATTEMPTS],
    );
    const job = await claimJob(anonDb);
    expect(job).toMatchObject({ statement_id: id, attempts: MAX_JOB_ATTEMPTS + 1 });
    await runJob(job!);
    const st = await userDb(user).one<{ status: string; error: string }>("select status, error from statements where id = $1", [id]);
    expect(st?.status).toBe("failed");
    expect(st?.error).toMatch(/kept failing/);
  });

  it("a retry re-queues the same job", async () => {
    const id = await uploaded();
    await enqueueStatement(userDb(user), user, id);
    await anonDb.query("update statement_jobs set status = 'failed', attempts = 3 where statement_id = $1", [id]);
    await enqueueStatement(userDb(user), user, id);
    expect(await anonDb.one("select status, attempts from statement_jobs where statement_id = $1", [id])).toEqual({ status: "queued", attempts: 0 });
  });
});
