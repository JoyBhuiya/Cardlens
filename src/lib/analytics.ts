import { categoryName } from "@/lib/categories";
import { LIMITS } from "@/lib/env";
import { detectRecurring, type RecurringCharge } from "@/lib/pipeline/recurring";
import { KIND_LABELS, TXN_KINDS, type TxnKind, type TxnRow } from "@/lib/types";
import { calendarYear, inPeriod, type Period } from "@/lib/period";
import { median, monthKey } from "@/lib/utils";

export interface StatementBalanceRow {
  card_id: string;
  period_start: string | null;
  period_end: string | null;
  opening_balance_pence: number | null;
  closing_balance_pence: number | null;
}

export interface Metrics {
  /** Start year of the period (kept for older stored reports). */
  year: number | null;
  /** "2026", "tax-2025", "m-2025-11"; absent on reports stored before periods existed. */
  period_key?: string | null;
  period_label?: string | null;
  period_start: string | null;
  period_end: string | null;
  transaction_count: number;
  card_count: number;
  months_covered: number;
  total_spend_pence: number;
  total_purchases_pence: number;
  total_refunds_pence: number;
  total_cash_advances_pence: number;
  total_payments_pence: number;
  total_interest_pence: number;
  total_fees_pence: number;
  interest_and_fees_pence: number;
  total_balance_transfers_pence: number;
  net_change_pence: number | null;
  average_month_spend_pence: number;
  median_month_spend_pence: number;
  heads: { kind: TxnKind; label: string; count: number; total_pence: number }[];
  monthly: { month: string; spend_pence: number; payments_pence: number; interest_fees_pence: number }[];
  top_categories: { slug: string; name: string; spend_pence: number; share_pct: number }[];
  top_merchants: { merchant: string; spend_pence: number; count: number; share_pct: number }[];
  recurring: RecurringCharge[];
  recurring_annual_total_pence: number;
  spikes: { month: string; spend_pence: number; ratio_to_median: number }[];
  business: { spend_pence: number; share_pct: number };
  foreign: { spend_pence: number; count: number };
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

/** Signed contribution of a transaction to "spend": purchases + cash advances − refunds. */
function spendContribution(t: TxnRow): number {
  if (t.kind === "purchase" || t.kind === "cash_advance") return t.amount_pence;
  if (t.kind === "refund") return -t.amount_pence;
  return 0;
}

export function computeMetrics(
  txns: TxnRow[],
  statements: StatementBalanceRow[] = [],
  opts: { period?: Period | null; year?: number | null; customCategoryNames?: Map<string, string> } = {},
): Metrics {
  const period = opts.period ?? (opts.year ? calendarYear(opts.year) : null);
  const year = period?.startYear ?? null;
  const rows = period ? txns.filter((t) => inPeriod(t.posted_on, period)) : txns;

  const byKind = new Map<TxnKind, { count: number; total: number }>();
  for (const k of TXN_KINDS) byKind.set(k, { count: 0, total: 0 });
  for (const t of rows) {
    const h = byKind.get(t.kind)!;
    h.count++;
    h.total += t.amount_pence;
  }
  const tot = (k: TxnKind) => byKind.get(k)!.total;

  const total_spend_pence = tot("purchase") + tot("cash_advance") - tot("refund");

  // Monthly
  const months = new Map<string, { spend: number; payments: number; intfees: number }>();
  for (const t of rows) {
    const m = monthKey(t.posted_on);
    const e = months.get(m) ?? { spend: 0, payments: 0, intfees: 0 };
    e.spend += spendContribution(t);
    if (t.kind === "payment") e.payments += t.amount_pence;
    if (t.kind === "interest" || t.kind === "fee") e.intfees += t.amount_pence;
    months.set(m, e);
  }
  const monthly = [...months]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, e]) => ({ month, spend_pence: e.spend, payments_pence: e.payments, interest_fees_pence: e.intfees }));
  const med = Math.round(median(monthly.map((m) => m.spend_pence)));
  const avg = monthly.length ? Math.round(total_spend_pence / monthly.length) : 0;
  const spikes = med > 0
    ? monthly
        .filter((m) => m.spend_pence > med * LIMITS.spikeFactor)
        .map((m) => ({ month: m.month, spend_pence: m.spend_pence, ratio_to_median: Math.round((m.spend_pence / med) * 10) / 10 }))
    : [];

  // Categories (purchases + cash − refunds, by category)
  const cats = new Map<string, number>();
  const merchants = new Map<string, { spend: number; count: number }>();
  for (const t of rows) {
    const c = spendContribution(t);
    if (c === 0) continue;
    cats.set(t.category, (cats.get(t.category) ?? 0) + c);
    if (t.kind !== "cash_advance") {
      const m = merchants.get(t.merchant) ?? { spend: 0, count: 0 };
      m.spend += c;
      if (c > 0) m.count++;
      merchants.set(t.merchant, m);
    }
  }
  const top_categories = [...cats]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([slug, spend]) => ({
      slug,
      name: categoryName(slug, opts.customCategoryNames),
      spend_pence: spend,
      share_pct: pct(spend, total_spend_pence),
    }));
  const top_merchants = [...merchants]
    .filter(([, v]) => v.spend > 0)
    .sort((a, b) => b[1].spend - a[1].spend)
    .slice(0, 10)
    .map(([merchant, v]) => ({ merchant, spend_pence: v.spend, count: v.count, share_pct: pct(v.spend, total_spend_pence) }));

  const recurring = detectRecurring(rows);
  const business = rows.filter((t) => t.is_business).reduce((s, t) => s + spendContribution(t), 0);
  const foreignRows = rows.filter((t) => t.foreign_currency && t.kind === "purchase");

  // Net change: per card, closing of the last statement − opening of the first.
  let net_change_pence: number | null = null;
  const withBalances = statements.filter(
    (s) => s.opening_balance_pence !== null && s.closing_balance_pence !== null && s.period_end,
  );
  if (withBalances.length) {
    const byCard = new Map<string, StatementBalanceRow[]>();
    for (const s of withBalances) {
      if (period && !inPeriod(s.period_end ?? "", period)) continue;
      const l = byCard.get(s.card_id) ?? [];
      l.push(s);
      byCard.set(s.card_id, l);
    }
    if (byCard.size) {
      net_change_pence = 0;
      for (const list of byCard.values()) {
        list.sort((a, b) => (a.period_end ?? "").localeCompare(b.period_end ?? ""));
        net_change_pence += list[list.length - 1].closing_balance_pence! - list[0].opening_balance_pence!;
      }
    }
  }

  const dates = rows.map((t) => t.posted_on).sort();
  return {
    year,
    period_key: period?.key ?? null,
    period_label: period?.label ?? null,
    period_start: dates[0] ?? null,
    period_end: dates[dates.length - 1] ?? null,
    transaction_count: rows.length,
    card_count: new Set(rows.map((t) => t.card_id)).size,
    months_covered: monthly.length,
    total_spend_pence,
    total_purchases_pence: tot("purchase"),
    total_refunds_pence: tot("refund"),
    total_cash_advances_pence: tot("cash_advance"),
    total_payments_pence: tot("payment"),
    total_interest_pence: tot("interest"),
    total_fees_pence: tot("fee"),
    interest_and_fees_pence: tot("interest") + tot("fee"),
    total_balance_transfers_pence: tot("balance_transfer"),
    net_change_pence,
    average_month_spend_pence: avg,
    median_month_spend_pence: med,
    heads: TXN_KINDS.map((k) => ({ kind: k, label: KIND_LABELS[k], count: byKind.get(k)!.count, total_pence: byKind.get(k)!.total })).filter(
      (h) => h.count > 0,
    ),
    monthly,
    top_categories,
    top_merchants,
    recurring,
    recurring_annual_total_pence: recurring.reduce((s, r) => s + r.annual_cost_pence, 0),
    spikes,
    business: { spend_pence: business, share_pct: pct(business, total_spend_pence) },
    foreign: { spend_pence: foreignRows.reduce((s, t) => s + t.amount_pence, 0), count: foreignRows.length },
  };
}
