import { toPence } from "@/lib/money";
import type { Direction, MerchantRule, PipelineTxn, TxnKind } from "@/lib/types";
import { categoryForKind, classifyKind } from "./classify";
import { assignDedupeHashes } from "./dedupe";
import { maskCardNumbers, resolveMerchant, toIsoDate } from "./normalise";
import { reconcile, type ReconcileResult } from "./reconcile";
import type { StatementExtraction } from "./schema";

/** One raw line from either the PDF extraction or the CSV parser. */
export interface RawLine {
  date: string;
  description: string;
  amount_pence: number;
  direction: Direction;
  ai_kind?: TxnKind;
  foreign_currency?: boolean;
}

export interface StatementHeader {
  issuer: string | null;
  card_last4: string | null;
  period_start: string | null;
  period_end: string | null;
  opening_balance_pence: number | null;
  closing_balance_pence: number | null;
  printed_total_debits_pence: number | null;
  printed_total_credits_pence: number | null;
}

export interface TransformResult {
  header: StatementHeader;
  transactions: PipelineTxn[];
  reconciliation: ReconcileResult;
  /** Merchants that still need a category (sent to the categorise model). */
  unknownMerchants: { merchant: string; sample: string }[];
  dateErrors: number;
}

/** Turn a Claude extraction into raw lines + header (pounds → pence, sign handling). */
export function fromExtraction(x: StatementExtraction): { header: StatementHeader; lines: RawLine[] } {
  const p = (v: number | null) => (v === null ? null : toPence(v));
  const header: StatementHeader = {
    issuer: x.issuer,
    card_last4: x.card_last4,
    period_start: x.period_start ? toIsoDate(x.period_start) : null,
    period_end: x.period_end ? toIsoDate(x.period_end) : null,
    opening_balance_pence: p(x.opening_balance),
    closing_balance_pence: p(x.closing_balance),
    printed_total_debits_pence: p(x.printed_total_debits),
    printed_total_credits_pence: p(x.printed_total_credits),
  };
  const lines: RawLine[] = x.transactions.map((t) => {
    const pence = toPence(t.amount) ?? 0;
    // Defensive: if the model returned a negative amount, flip the direction.
    const direction: Direction = pence < 0 ? (t.direction === "debit" ? "credit" : "debit") : t.direction;
    return {
      date: t.date,
      description: t.description,
      amount_pence: Math.abs(pence),
      direction,
      ai_kind: t.kind,
      foreign_currency: t.foreign_currency,
    };
  });
  return { header, lines };
}

/**
 * Steps 3–6 of the pipeline, pure: mask & normalise → reconcile → classify heads → categorise
 * (user rules, then dictionary; unknown merchants are returned for the AI step).
 */
export function transformStatement(
  cardId: string,
  header: StatementHeader,
  lines: RawLine[],
  rules: MerchantRule[],
): TransformResult {
  let dateErrors = 0;
  const period = { start: header.period_start, end: header.period_end };

  const normalised = lines
    .map((l) => {
      const posted_on = toIsoDate(l.date, period);
      if (!posted_on) {
        dateErrors++;
        return null;
      }
      const description_raw = maskCardNumbers(l.description).slice(0, 300);
      return { ...l, posted_on, description_raw };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null && x.amount_pence > 0);

  const reconciliation = reconcile({
    opening_balance_pence: header.opening_balance_pence,
    closing_balance_pence: header.closing_balance_pence,
    printed_total_debits_pence: header.printed_total_debits_pence,
    printed_total_credits_pence: header.printed_total_credits_pence,
    transactions: normalised,
  });
  if (dateErrors > 0) {
    reconciliation.issues.push(`${dateErrors} line(s) had a date we could not read and were left out.`);
    if (reconciliation.reconciled) reconciliation.reconciled = false;
  }

  const unknown = new Map<string, string>();
  const withHashes = assignDedupeHashes(cardId, normalised);
  const transactions: PipelineTxn[] = withHashes.map((t) => {
    const kind = classifyKind(t.description_raw, t.direction, t.ai_kind);
    const m = resolveMerchant(t.description_raw, rules);
    const kindCategory = categoryForKind(kind);
    let category = "uncategorised";
    let category_source: PipelineTxn["category_source"] = "system";
    if (kindCategory) {
      category = kindCategory;
      category_source = "kind";
    } else if (m.category) {
      category = m.category;
      category_source = m.source === "user_rule" ? "user_rule" : "dictionary";
    } else {
      unknown.set(m.merchant, t.description_raw);
    }
    const merchant = kind === "payment" ? "Card payment" : kind === "interest" ? "Interest" : m.merchant;
    return {
      posted_on: t.posted_on,
      description_raw: t.description_raw,
      merchant,
      amount_pence: t.amount_pence,
      direction: t.direction,
      kind,
      category,
      category_source,
      is_business: m.is_business ?? category === "business",
      is_recurring: false,
      foreign_currency: Boolean(t.foreign_currency),
      dedupe_hash: t.dedupe_hash,
    };
  });

  return {
    header,
    transactions,
    reconciliation,
    unknownMerchants: [...unknown].map(([merchant, sample]) => ({ merchant, sample })),
    dateErrors,
  };
}

/** Apply AI categories to transactions still marked uncategorised. */
export function applyAiCategories(txns: PipelineTxn[], ai: Map<string, string>): PipelineTxn[] {
  return txns.map((t) => {
    if (t.category !== "uncategorised" || t.category_source !== "system") return t;
    const cat = ai.get(t.merchant);
    if (!cat || cat === "uncategorised") return t;
    return { ...t, category: cat, category_source: "ai", is_business: t.is_business || cat === "business" };
  });
}
