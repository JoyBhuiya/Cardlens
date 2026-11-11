import "server-only";
import pg from "pg";
import { serverEnv } from "@/lib/env";

// Return Postgres values in the shapes the app already uses: ISO date strings, numbers for pence and counts.
pg.types.setTypeParser(1082, (v) => v); // date → "yyyy-mm-dd"
pg.types.setTypeParser(20, (v) => Number(v)); // int8 → number (pence and counts stay far below 2^53)
pg.types.setTypeParser(1184, (v) => new Date(v).toISOString()); // timestamptz → ISO string

export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  one<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T | null>;
}

export interface UserDb extends Db {
  /** Several statements in one transaction (all-or-nothing). */
  tx<R>(fn: (db: Db) => Promise<R>): Promise<R>;
}

const globalForPool = globalThis as unknown as { cardlensPool?: pg.Pool };

/** One pool per process, connected as the non-owner app role, so row-level security applies. */
export function pool(): pg.Pool {
  if (!globalForPool.cardlensPool) {
    globalForPool.cardlensPool = new pg.Pool({
      connectionString: serverEnv.databaseUrl(),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      statement_timeout: 30_000,
    });
    globalForPool.cardlensPool.on("error", (err) => console.error("postgres pool error", err.message));
  }
  return globalForPool.cardlensPool;
}

function wrap(client: pg.PoolClient | pg.Pool): Db {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      return (await client.query(text, params)).rows as T[];
    },
    async one<T>(text: string, params: unknown[] = []) {
      return ((await client.query(text, params)).rows[0] as T | undefined) ?? null;
    },
  };
}

/** Queries that belong to no user: the waitlist and anonymous rate limits. User tables are invisible here (RLS). */
export const anonDb: Db = {
  query: (text, params) => wrap(pool()).query(text, params),
  one: (text, params) => wrap(pool()).one(text, params),
};

/**
 * Queries as one user. Each call runs in its own short transaction with app.user_id set, so RLS limits every
 * statement to that user's rows. Calls are short on purpose: the pipeline holds no transaction open across a
 * Claude request.
 */
export function userDb(userId: string): UserDb {
  async function run<R>(fn: (db: Db) => Promise<R>): Promise<R> {
    const client = await pool().connect();
    try {
      await client.query("begin");
      await client.query("select set_config('app.user_id', $1, true)", [userId]);
      const result = await fn(wrap(client));
      await client.query("commit");
      return result;
    } catch (err) {
      await client.query("rollback").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
  return {
    query: (text, params) => run((db) => db.query(text, params)),
    one: (text, params) => run((db) => db.one(text, params)),
    tx: run,
  };
}
