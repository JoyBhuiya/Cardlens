import "server-only";
import { createHash } from "node:crypto";
import { anonDb, type Db } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { UserError } from "@/lib/errors";

/** A limit was reached; the message is safe to show to the user. */
export class LimitError extends UserError {}

export type AiPurpose = "extract" | "categorise" | "summary";

/** Wraps every Claude request: checks the allowance before, records tokens after (also on failure). */
export interface AiMeter {
  before(): Promise<void>;
  after(model: string, usage: { input_tokens: number; output_tokens: number } | null): Promise<void>;
}

async function count(db: Db, sql: string, params: unknown[]): Promise<number> {
  const row = await db.one<{ n: number }>(sql, params);
  return row?.n ?? 0;
}

export async function assertUploadAllowance(db: Db, userId: string): Promise<void> {
  const limit = serverEnv.uploadsPerDay();
  const n = await count(
    db,
    "select count(*) as n from usage_events where user_id = $1 and kind = 'upload' and created_at > now() - interval '24 hours'",
    [userId],
  );
  if (n >= limit) throw new LimitError(`You've reached the limit of ${limit} uploads in 24 hours. Please try again tomorrow.`);
}

export async function recordUpload(db: Db, userId: string): Promise<void> {
  await db.query("insert into usage_events (user_id, kind) values ($1, 'upload')", [userId]);
}

export function aiMeter(db: Db, userId: string, purpose: AiPurpose): AiMeter {
  return {
    async before() {
      const perUser = serverEnv.aiCallsPerMonth();
      const mine = await count(
        db,
        "select count(*) as n from usage_events where user_id = $1 and kind = 'ai_call' and created_at > now() - interval '30 days'",
        [userId],
      );
      if (mine >= perUser) throw new LimitError("You've reached this month's processing limit. Please contact us if you need more.");
      const all = await count(db, "select count(*) as n from usage_events where kind = 'ai_call' and created_at > now() - interval '24 hours'", []);
      if (all >= serverEnv.aiCallsPerDay()) {
        console.error("global AI daily cap reached");
        throw new LimitError("Cardlens is busy right now. Please try again tomorrow.");
      }
    },
    async after(model, usage) {
      await db.query(
        "insert into usage_events (user_id, kind, purpose, model, input_tokens, output_tokens) values ($1, 'ai_call', $2, $3, $4, $5)",
        [userId, purpose, model, usage?.input_tokens ?? null, usage?.output_tokens ?? null],
      );
    },
  };
}

export function hashIp(ip: string): string {
  return createHash("sha256").update(`${serverEnv.ipHashSalt()}:${ip}`).digest("hex").slice(0, 32);
}

/** Fixed-window counter. Returns false once `limit` hits are used in the current window. */
export async function takeRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const row = await anonDb.one<{ hits: number }>(
    `insert into rate_limits (key, window_start, hits)
     values ($1, to_timestamp(floor(extract(epoch from now()) / $2) * $2), 1)
     on conflict (key, window_start) do update set hits = rate_limits.hits + 1
     returning hits`,
    [key, windowSeconds],
  );
  // Housekeeping: old windows are useless; drop them now and then.
  if (Math.random() < 0.02) await anonDb.query("delete from rate_limits where window_start < now() - interval '2 days'");
  return (row?.hits ?? 0) <= limit;
}
