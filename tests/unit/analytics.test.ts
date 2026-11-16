import { describe, expect, it } from "vitest";
import { computeMetrics } from "@/lib/analytics";
import { parsePeriodKey } from "@/lib/period";
import { allowedAmounts, poundFigures, validateSummary } from "@/lib/summary/validate";
import { templateSummary } from "@/lib/summary/template";
import type { TxnRow } from "@/lib/types";

const t = (posted_on: string, merchant: string, amount_pence: number, kind: TxnRow["kind"], category: string, extra: Partial<TxnRow> = {}): TxnRow => ({
  card_id: "c1",
  posted_on,
  merchant,
  amount_pence,
  direction: kind === "payment" || kind === "refund" ? "credit" : "debit",
  kind,
  category,
  is_business: false,
  ...extra,
});

const rows: TxnRow[] = [];
for (let m = 1; m <= 12; m++) {
  const mm = String(m).padStart(2, "0");
  rows.push(t(`2026-${mm}-03`, "Netflix", 1099, "purchase", "subscriptions"));
  rows.push(t(`2026-${mm}-05`, "Tesco", 30000, "purchase", "groceries"));
  rows.push(t(`2026-${mm}-20`, "Card payment", 40000, "payment", "payments"));
}
rows.push(t("2026-08-10", "easyJet", 60000, "purchase", "travel"));
rows.push(t("2026-08-12", "easyJet", 10000, "refund", "travel"));
rows.push(t("2026-04-28", "Interest", 2137, "interest", "fees_interest"));
rows.push(t("2026-04-28", "Late fee", 1200, "fee", "fees_interest"));
rows.push(t("2026-06-01", "Shopify", 2500, "purchase", "business", { is_business: true }));
rows.push(t("2026-07-01", "ATM", 10000, "cash_advance", "cash"));
rows.push(t("2025-12-30", "Tesco", 99999, "purchase", "groceries")); // other year

const statements = [
  { card_id: "c1", period_start: "2025-12-29", period_end: "2026-01-28", opening_balance_pence: 50000, closing_balance_pence: 41099 },
  { card_id: "c1", period_start: "2026-11-29", period_end: "2026-12-28", opening_balance_pence: 70000, closing_balance_pence: 61000 },
];

describe("computeMetrics", () => {
  const m = computeMetrics(rows, statements, { year: 2026 });

  it("computes the heads", () => {
    expect(m.total_purchases_pence).toBe(12 * 1099 + 12 * 30000 + 60000 + 2500);
    expect(m.total_refunds_pence).toBe(10000);
    expect(m.total_cash_advances_pence).toBe(10000);
    expect(m.total_spend_pence).toBe(m.total_purchases_pence + 10000 - 10000);
    expect(m.total_payments_pence).toBe(12 * 40000);
    expect(m.interest_and_fees_pence).toBe(3337);
    expect(m.net_change_pence).toBe(61000 - 50000);
  });
  it("filters to the year", () => {
    expect(m.transaction_count).toBe(rows.length - 1);
    expect(m.months_covered).toBe(12);
  });
  it("ranks categories net of refunds", () => {
    expect(m.top_categories[0]).toMatchObject({ slug: "groceries", spend_pence: 360000 });
    expect(m.top_categories.find((c) => c.slug === "travel")?.spend_pence).toBe(50000);
  });
  it("finds recurring charges and spikes", () => {
    expect(m.recurring.map((r) => r.merchant)).toContain("Netflix");
    expect(m.recurring.find((r) => r.merchant === "Netflix")?.annual_cost_pence).toBe(13188);
    expect(m.spikes.map((s) => s.month)).toEqual(["2026-08"]);
  });
  it("computes business share", () => {
    expect(m.business.spend_pence).toBe(2500);
  });
});

describe("summary validator", () => {
  const m = computeMetrics(rows, statements, { year: 2026 });

  it("extracts £ figures from text", () => {
    expect(poundFigures("You spent £1,234.56 and saved £12 and £3k")).toEqual([123456, 1200, 300000]);
  });
  it("accepts figures from or derived from the metrics", () => {
    const allowed = allowedAmounts(m);
    expect(allowed).toContain(m.total_spend_pence);
    expect(allowed).toContain(m.interest_and_fees_pence * 12);
  });
  it("rejects invented figures", () => {
    const bad = templateSummary(m);
    bad.key_findings[0] = "You could save £4,321.99 by switching.";
    const v = validateSummary(bad, m);
    expect(v.ok).toBe(false);
    expect(v.ungrounded).toContain(432199);
  });
  it("rejects product advice", () => {
    const bad = templateSummary(m);
    bad.saving_ideas[0].detail = "Apply for a 0% card to move your balance.";
    expect(validateSummary(bad, m).ok).toBe(false);
  });
  it("the template fallback always passes its own validator", () => {
    const v = validateSummary(templateSummary(m), m);
    expect(v.problems).toEqual([]);
  });
});

describe("computeMetrics for any period", () => {
  it("filters a UK tax year by date (6 Apr – 5 Apr) and labels it", () => {
    const tax = parsePeriodKey("tax-2025")!;
    const m = computeMetrics(rows, statements, { period: tax });
    expect(m.period_key).toBe("tax-2025");
    expect(m.period_label).toBe("2025/26 tax year");
    // Inside 2025/26: 30 Dec 2025, and Jan–Apr 2026 lines dated the 3rd and 5th (before 6 April).
    // Outside: the 20 April payment and the 28 April interest and fee.
    expect(m.total_interest_pence).toBe(0);
    expect(m.total_purchases_pence).toBe(99999 + 4 * (1099 + 30000));
    expect(m.total_payments_pence).toBe(3 * 40000);
    expect(m.monthly.map((x) => x.month)).toEqual(["2025-12", "2026-01", "2026-02", "2026-03", "2026-04"]);
  });
  it("still accepts { year } and matches the calendar-year period", () => {
    expect(computeMetrics(rows, statements, { year: 2026 })).toEqual(computeMetrics(rows, statements, { period: parsePeriodKey("2026")! }));
  });
});
