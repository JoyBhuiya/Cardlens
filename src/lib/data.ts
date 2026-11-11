import "server-only";
import type { StatementBalanceRow } from "@/lib/analytics";
import type { Db } from "@/lib/db";
import type { TxnRow } from "@/lib/types";

// Every query here runs through a user-scoped handle (userDb), so RLS limits it to that user's rows.

export interface CardRow {
  id: string;
  issuer: string;
  nickname: string | null;
  last4: string | null;
}

export async function getCards(db: Db): Promise<CardRow[]> {
  return db.query<CardRow>("select id, issuer, nickname, last4 from cards order by created_at");
}

export function cardLabel(c: Pick<CardRow, "issuer" | "nickname" | "last4">): string {
  return `${c.nickname || c.issuer}${c.last4 ? ` ••${c.last4}` : ""}`;
}

export type FullTxn = TxnRow & { id: string; statement_id: string; description_raw: string; is_recurring: boolean };

export async function getAllTransactions(db: Db, opts: { year?: number } = {}): Promise<FullTxn[]> {
  const params: unknown[] = [];
  let where = "";
  if (opts.year) {
    params.push(`${opts.year}-01-01`, `${opts.year}-12-31`);
    where = "where posted_on between $1 and $2";
  }
  return db.query<FullTxn>(
    `select id, statement_id, card_id, posted_on, merchant, description_raw, amount_pence, direction, kind, category,
            is_business, is_recurring, foreign_currency
     from transactions ${where} order by posted_on, id`,
    params,
  );
}

export async function getStatementBalances(db: Db): Promise<StatementBalanceRow[]> {
  return db.query<StatementBalanceRow>(
    `select card_id, period_start, period_end, opening_balance_pence, closing_balance_pence
     from statements where status in ('parsed', 'needs_review')`,
  );
}

/** Calendar years that have transactions, newest first. */
export async function getYears(db: Db): Promise<number[]> {
  const row = await db.one<{ first: string | null; last: string | null }>("select min(posted_on) as first, max(posted_on) as last from transactions");
  if (!row?.first || !row.last) return [];
  const a = Number(row.first.slice(0, 4));
  const b = Number(row.last.slice(0, 4));
  const years: number[] = [];
  for (let y = b; y >= a; y--) years.push(y);
  return years;
}

export async function getCustomCategoryNames(db: Db): Promise<Map<string, string>> {
  const rows = await db.query<{ slug: string; name: string }>("select slug, name from categories where not is_system");
  return new Map(rows.map((c) => [c.slug, c.name]));
}

export async function getAllCategories(db: Db): Promise<{ slug: string; name: string; group: string; is_system: boolean }[]> {
  return db.query('select slug, name, "group", is_system from categories order by is_system desc, name');
}
