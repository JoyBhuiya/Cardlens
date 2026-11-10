import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { toPence, formatPence } from "@/lib/money";
import { maskCardNumbers, resolveMerchant, safeLast4, toIsoDate, heuristicMerchant } from "@/lib/pipeline/normalise";
import { classifyKind } from "@/lib/pipeline/classify";
import { reconcile } from "@/lib/pipeline/reconcile";
import { assignDedupeHashes } from "@/lib/pipeline/dedupe";
import { parseStatementCsv } from "@/lib/pipeline/csv";
import { detectRecurring } from "@/lib/pipeline/recurring";
import { StatementExtraction } from "@/lib/pipeline/schema";
import { applyAiCategories, fromExtraction, transformStatement } from "@/lib/pipeline/transform";

const fixture = (f: string) => fs.readFileSync(path.join(__dirname, "../../fixtures", f), "utf8");

describe("money", () => {
  it("parses UK amount formats to pence", () => {
    expect(toPence("£1,234.56")).toBe(123456);
    expect(toPence("12.5")).toBe(1250);
    expect(toPence("-12.00")).toBe(-1200);
    expect(toPence("45.00 CR")).toBe(-4500);
    expect(toPence("(9.99)")).toBe(-999);
    expect(toPence(10.99)).toBe(1099);
    expect(toPence(0.1 + 0.2)).toBe(30);
    expect(toPence("abc")).toBeNull();
    expect(toPence("")).toBeNull();
  });
  it("formats pence as GBP", () => {
    expect(formatPence(123456)).toBe("£1,234.56");
    expect(formatPence(123456, { whole: true })).toBe("£1,235");
  });
});

describe("normalise", () => {
  it("masks full card numbers to the last 4 digits", () => {
    expect(maskCardNumbers("ATM 4929 1234 5678 9012 HSBC")).toBe("ATM ••••9012 HSBC");
    expect(maskCardNumbers("card 4929123456789012")).toBe("card ••••9012");
    expect(maskCardNumbers("REF 12345 TESCO")).toBe("REF 12345 TESCO");
    expect(safeLast4("**** **** **** 1234")).toBe("1234");
    expect(safeLast4("12")).toBeNull();
  });
  it("converts UK dates to ISO", () => {
    expect(toIsoDate("2026-03-02")).toBe("2026-03-02");
    expect(toIsoDate("02/03/2026")).toBe("2026-03-02");
    expect(toIsoDate("02/03/26")).toBe("2026-03-02");
    expect(toIsoDate("2 Mar 2026")).toBe("2026-03-02");
    expect(toIsoDate("31 Feb 2026")).toBeNull();
    // Year inferred from a period that crosses 31 December
    expect(toIsoDate("28 Dec", { start: "2025-12-15", end: "2026-01-14" })).toBe("2025-12-28");
    expect(toIsoDate("05 Jan", { start: "2025-12-15", end: "2026-01-14" })).toBe("2026-01-05");
  });
  it("cleans merchants: user rules, then dictionary, then heuristic", () => {
    expect(resolveMerchant("AMZNMKTPLACE*2X4 AMAZON.CO.UK", []).merchant).toBe("Amazon");
    expect(resolveMerchant("AMAZON PRIME*AB12 AMZN.CO.UK", []).merchant).toBe("Amazon Prime");
    expect(resolveMerchant("UBER *EATS HELP.UBER.COM", []).merchant).toBe("Uber Eats");
    const rule = resolveMerchant("SQ *THE LITTLE BAKERY BRIGHTON", [
      { pattern: "LITTLE BAKERY", merchant: "Little Bakery", category: "dining", is_business: false },
    ]);
    expect(rule).toMatchObject({ merchant: "Little Bakery", category: "dining", source: "user_rule" });
    expect(heuristicMerchant("SQ *THE LITTLE BAKERY BRIGHTON")).toBe("The Little Bakery Brighton");
    // Token matching: "O2" must not match inside a reference
    expect(resolveMerchant("REF AB1O2X CAFE ROMA", []).source).toBe("heuristic");
  });
});

describe("classify heads", () => {
  it("applies rules before the AI kind", () => {
    expect(classifyKind("PAYMENT RECEIVED - THANK YOU", "credit")).toBe("payment");
    expect(classifyKind("DIRECT DEBIT PAYMENT", "credit")).toBe("payment");
    expect(classifyKind("ASOS.COM", "credit")).toBe("refund");
    expect(classifyKind("INTEREST ON PURCHASES", "debit")).toBe("interest");
    expect(classifyKind("LATE PAYMENT FEE", "debit")).toBe("fee");
    expect(classifyKind("CASH ADVANCE FEE", "debit")).toBe("fee");
    expect(classifyKind("CASH WITHDRAWAL HSBC ATM", "debit", "purchase")).toBe("cash_advance");
    expect(classifyKind("BALANCE TRANSFER", "debit")).toBe("balance_transfer");
    expect(classifyKind("TESCO", "debit", "purchase")).toBe("purchase");
    expect(classifyKind("SOMETHING", "debit", "fee")).toBe("fee");
  });
});

describe("reconcile", () => {
  it("passes when opening + debits − credits = closing", () => {
    const r = reconcile({
      opening_balance_pence: 10000,
      closing_balance_pence: 12500,
      printed_total_debits_pence: 5000,
      printed_total_credits_pence: 2500,
      transactions: [
        { amount_pence: 5000, direction: "debit" },
        { amount_pence: 2500, direction: "credit" },
      ],
    });
    expect(r).toMatchObject({ reconciled: true, diff_pence: 0, issues: [] });
  });
  it("flags a gap over £1 and says which totals disagree", () => {
    const r = reconcile({
      opening_balance_pence: 10000,
      closing_balance_pence: 13000,
      printed_total_debits_pence: 5500,
      printed_total_credits_pence: null,
      transactions: [
        { amount_pence: 5000, direction: "debit" },
        { amount_pence: 2500, direction: "credit" },
      ],
    });
    expect(r.reconciled).toBe(false);
    expect(r.diff_pence).toBe(500);
    expect(r.issues.length).toBe(2);
  });
  it("tolerates up to £1 but still reports it", () => {
    const r = reconcile({
      opening_balance_pence: 0,
      closing_balance_pence: 5099,
      printed_total_debits_pence: null,
      printed_total_credits_pence: null,
      transactions: [{ amount_pence: 5000, direction: "debit" }],
    });
    expect(r.reconciled).toBe(true);
    expect(r.diff_pence).toBe(99);
  });
  it("returns null when there are no balances (CSV)", () => {
    const r = reconcile({ opening_balance_pence: null, closing_balance_pence: null, printed_total_debits_pence: null, printed_total_credits_pence: null, transactions: [] });
    expect(r.reconciled).toBeNull();
  });
});

describe("dedupe", () => {
  const t = (d: string, a: number, desc = "PRET A MANGER") => ({ posted_on: d, amount_pence: a, direction: "debit" as const, description_raw: desc });
  it("keeps genuine identical lines within a statement but matches them across statements", () => {
    const a = assignDedupeHashes("card1", [t("2026-03-05", 685), t("2026-03-05", 685)]);
    expect(a[0].dedupe_hash).not.toBe(a[1].dedupe_hash);
    const overlap = assignDedupeHashes("card1", [t("2026-03-05", 685), t("2026-03-05", 685), t("2026-03-06", 100)]);
    expect(overlap[0].dedupe_hash).toBe(a[0].dedupe_hash);
    expect(overlap[1].dedupe_hash).toBe(a[1].dedupe_hash);
    expect(assignDedupeHashes("card2", [t("2026-03-05", 685)])[0].dedupe_hash).not.toBe(a[0].dedupe_hash);
  });
});

describe("sample statement end to end (steps 3–6)", () => {
  const extraction = StatementExtraction.parse(JSON.parse(fixture("sample-statement.extraction.json")));
  const { header, lines } = fromExtraction(extraction);
  const result = transformStatement("card1", header, lines, []);

  it("reconciles to the penny", () => {
    expect(result.reconciliation.reconciled).toBe(true);
    expect(result.reconciliation.diff_pence).toBe(0);
    expect(result.reconciliation.issues).toEqual([]);
    expect(header.closing_balance_pence).toBe(97867);
  });
  it("masks the card number that appeared in a description", () => {
    expect(result.transactions.some((t) => /\d{12,}|\d{4} \d{4} \d{4}/.test(t.description_raw))).toBe(false);
    expect(result.transactions.find((t) => t.kind === "cash_advance")?.description_raw).toContain("••••9012");
  });
  it("separates the heads", () => {
    const kinds = result.transactions.reduce<Record<string, number>>((acc, t) => ((acc[t.kind] = (acc[t.kind] ?? 0) + 1), acc), {});
    expect(kinds).toMatchObject({ purchase: 13, payment: 1, refund: 1, fee: 2, interest: 1, cash_advance: 1 });
  });
  it("categorises from the dictionary and leaves unknowns for the AI", () => {
    const tesco = result.transactions.find((t) => t.merchant === "Tesco");
    expect(tesco?.category).toBe("groceries");
    expect(result.transactions.find((t) => t.merchant === "Shopify")?.is_business).toBe(true);
    expect(result.transactions.find((t) => t.kind === "refund")?.category).toBe("shopping");
    expect(result.unknownMerchants.map((u) => u.merchant)).toContain("The Little Bakery Brighton");
    const after = applyAiCategories(result.transactions, new Map([["The Little Bakery Brighton", "dining"]]));
    expect(after.find((t) => t.merchant === "The Little Bakery Brighton")).toMatchObject({ category: "dining", category_source: "ai" });
  });
  it("drops nothing when the same statement is uploaded twice (hashes are stable)", () => {
    const again = transformStatement("card1", header, lines, []);
    expect(again.transactions.map((t) => t.dedupe_hash)).toEqual(result.transactions.map((t) => t.dedupe_hash));
    expect(new Set(result.transactions.map((t) => t.dedupe_hash)).size).toBe(result.transactions.length);
  });
});

describe("csv", () => {
  it("detects a single signed amount column (charges positive)", () => {
    const r = parseStatementCsv(fixture("sample-amex.csv"));
    expect(r.transactions).toHaveLength(6);
    expect(r.transactions[0]).toMatchObject({ posted_on: "2026-03-02", amount_pence: 6432, direction: "debit" });
    expect(r.transactions[2]).toMatchObject({ amount_pence: 45000, direction: "credit" });
    expect(r.period_start).toBe("2026-03-02");
  });
  it("detects separate money out / money in columns", () => {
    const r = parseStatementCsv(fixture("sample-debit-credit.csv"));
    expect(r.transactions).toEqual([
      { posted_on: "2026-03-02", description_raw: "TESCO STORES 3042", amount_pence: 6432, direction: "debit" },
      { posted_on: "2026-03-10", description_raw: "PAYMENT RECEIVED", amount_pence: 45000, direction: "credit" },
    ]);
  });
  it("handles charges shown as negative numbers", () => {
    const r = parseStatementCsv("Date,Description,Amount\n01/03/2026,TESCO,-10.00\n02/03/2026,SHELL,-40.00\n05/03/2026,PAYMENT,100.00\n");
    expect(r.transactions.map((t) => t.direction)).toEqual(["debit", "debit", "credit"]);
  });
  it("explains a CSV it cannot map", () => {
    expect(() => parseStatementCsv("foo,bar\n1,2\n")).toThrow(/Columns found: foo, bar/);
  });
});

describe("recurring", () => {
  const p = (merchant: string, amount: number, date: string) => ({ merchant, category: "subscriptions", amount_pence: amount, posted_on: date, kind: "purchase" });
  it("flags the same merchant and similar amount in 3+ months", () => {
    const r = detectRecurring([
      p("Netflix", 1099, "2026-01-03"),
      p("Netflix", 1099, "2026-02-03"),
      p("Netflix", 1299, "2026-03-03"),
      p("Tesco", 6432, "2026-01-02"),
      p("Tesco", 2210, "2026-02-09"),
      p("Tesco", 9050, "2026-03-11"),
      p("Pret", 685, "2026-01-05"),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ merchant: "Netflix", months_seen: 3, typical_pence: 1099, annual_cost_pence: 13188 });
  });
  it("ignores frequent everyday spending", () => {
    const rows = [];
    for (let m = 1; m <= 4; m++) for (let d = 1; d <= 10; d++) rows.push(p("Pret", 685, `2026-0${m}-${String(d).padStart(2, "0")}`));
    expect(detectRecurring(rows)).toHaveLength(0);
  });
});
