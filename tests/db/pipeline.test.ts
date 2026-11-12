import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Claude is mocked: tests never call the real API. Unknown merchants come back as "shopping".
vi.mock("@/lib/ai/client", () => ({
  anthropic: () => ({
    messages: {
      parse: vi.fn(async (req: { messages: { content: string }[] }) => {
        const batch = JSON.parse(req.messages[0].content) as { merchant: string }[];
        return {
          parsed_output: { items: batch.map((b) => ({ merchant: b.merchant, category: "shopping" })) },
          usage: { input_tokens: 500, output_tokens: 80 },
        };
      }),
    },
  }),
}));

const { anonDb, pool, userDb } = await import("@/lib/db");
const { processStatement } = await import("@/lib/pipeline/run");
const { saveFile } = await import("@/lib/storage");
const { createCard, createUser } = await import("./helpers");

const CSV = [
  "Date,Description,Amount",
  "02/03/2026,TESCO STORES 3042,64.32",
  "04/03/2026,ZQX WIDGET EMPORIUM LTD,19.99",
  "10/03/2026,PAYMENT RECEIVED - THANK YOU,-450.00",
  "",
].join("\n");

let user: string;
let card: string;

async function upload(csv: string): Promise<string> {
  const filePath = `${user}/${randomUUID()}.csv`;
  await saveFile(user, filePath, new TextEncoder().encode(csv));
  const row = await userDb(user).one<{ id: string }>(
    "insert into statements (user_id, card_id, file_path, file_name, file_type, status) values ($1, $2, $3, 'test.csv', 'csv', 'uploaded') returning id",
    [user, card, filePath],
  );
  return row!.id;
}

beforeAll(async () => {
  user = await createUser();
  card = await createCard(user);
});

afterAll(async () => {
  await anonDb.query('delete from "user" where id = $1', [user]);
  await pool().end();
});

describe("processStatement (Postgres + disk)", () => {
  it("parses a CSV, categorises unknown merchants through the meter, stores rows and deletes the file", async () => {
    const id = await upload(CSV);
    const result = await processStatement(userDb(user), user, id);
    expect(result).toMatchObject({ status: "parsed", transactionCount: 3, duplicatesDropped: 0 });

    const db = userDb(user);
    const rows = await db.query<{ merchant: string; category: string; category_source: string }>(
      "select merchant, category, category_source from transactions where statement_id = $1 order by posted_on",
      [id],
    );
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.category_source === "ai")?.category).toBe("shopping");

    const st = await db.one<{ status: string; file_path: string | null }>("select status, file_path from statements where id = $1", [id]);
    expect(st).toEqual({ status: "parsed", file_path: null });
    expect(await readdir(path.join(process.env.STORAGE_DIR!, user))).toEqual([]);

    const calls = await db.one<{ n: number }>("select count(*) as n from usage_events where user_id = $1 and purpose = 'categorise'", [user]);
    expect(calls?.n).toBe(1);
  });

  it("refuses to run a statement again once parsed", async () => {
    const [{ id }] = await userDb(user).query<{ id: string }>("select id from statements where status = 'parsed' limit 1");
    const again = await processStatement(userDb(user), user, id);
    expect(again.status).toBe("failed");
    const st = await userDb(user).one<{ status: string }>("select status from statements where id = $1", [id]);
    expect(st?.status).toBe("parsed");
  });

  it("skips lines already imported from an overlapping statement", async () => {
    const id = await upload(CSV);
    const result = await processStatement(userDb(user), user, id);
    expect(result).toMatchObject({ status: "parsed", transactionCount: 0, duplicatesDropped: 3 });
  });

  it("marks a file it cannot read as failed with a message for the user", async () => {
    const id = await upload("foo,bar\n1,2\n");
    const result = await processStatement(userDb(user), user, id);
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/Columns found: foo, bar/);
  });

  it("cannot process another user's statement", async () => {
    const [{ id }] = await userDb(user).query<{ id: string }>("select id from statements limit 1");
    const mallory = await createUser();
    const result = await processStatement(userDb(mallory), mallory, id);
    expect(result.error).toBe("Statement not found.");
    await anonDb.query('delete from "user" where id = $1', [mallory]);
  });
});
