import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StatementBalanceRow } from "@/lib/analytics";
import type { TxnRow } from "@/lib/types";

export interface CardRow {
  id: string;
  issuer: string;
  nickname: string | null;
  last4: string | null;
}

export async function getCards(supabase: SupabaseClient): Promise<CardRow[]> {
  const { data } = await supabase.from("cards").select("id, issuer, nickname, last4").order("created_at");
  return data ?? [];
}

export function cardLabel(c: Pick<CardRow, "issuer" | "nickname" | "last4">): string {
  return `${c.nickname || c.issuer}${c.last4 ? ` ••${c.last4}` : ""}`;
}

/** Supabase caps a select at 1000 rows; page through everything. */
export async function getAllTransactions(
  supabase: SupabaseClient,
  opts: { year?: number; columns?: string } = {},
): Promise<(TxnRow & { id: string; statement_id: string; description_raw: string; is_recurring: boolean })[]> {
  const columns =
    opts.columns ??
    "id, statement_id, card_id, posted_on, merchant, description_raw, amount_pence, direction, kind, category, is_business, is_recurring, foreign_currency";
  const out: never[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    let q = supabase.from("transactions").select(columns).order("posted_on", { ascending: true }).order("id").range(from, from + page - 1);
    if (opts.year) q = q.gte("posted_on", `${opts.year}-01-01`).lte("posted_on", `${opts.year}-12-31`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as never[]));
    if (!data || data.length < page) break;
  }
  return out;
}

export async function getStatementBalances(supabase: SupabaseClient): Promise<StatementBalanceRow[]> {
  const { data } = await supabase
    .from("statements")
    .select("card_id, period_start, period_end, opening_balance_pence, closing_balance_pence")
    .in("status", ["parsed", "needs_review"]);
  return data ?? [];
}

/** Calendar years that have transactions, newest first. */
export async function getYears(supabase: SupabaseClient): Promise<number[]> {
  const [{ data: first }, { data: last }] = await Promise.all([
    supabase.from("transactions").select("posted_on").order("posted_on", { ascending: true }).limit(1),
    supabase.from("transactions").select("posted_on").order("posted_on", { ascending: false }).limit(1),
  ]);
  if (!first?.[0] || !last?.[0]) return [];
  const a = Number(first[0].posted_on.slice(0, 4));
  const b = Number(last[0].posted_on.slice(0, 4));
  const years: number[] = [];
  for (let y = b; y >= a; y--) years.push(y);
  return years;
}

export async function getCustomCategoryNames(supabase: SupabaseClient): Promise<Map<string, string>> {
  const { data } = await supabase.from("categories").select("slug, name").eq("is_system", false);
  return new Map((data ?? []).map((c) => [c.slug, c.name]));
}

export async function getAllCategories(supabase: SupabaseClient): Promise<{ slug: string; name: string; group: string; is_system: boolean }[]> {
  const { data } = await supabase.from("categories").select('slug, name, "group", is_system').order("is_system", { ascending: false }).order("name");
  return (data ?? []) as { slug: string; name: string; group: string; is_system: boolean }[];
}
