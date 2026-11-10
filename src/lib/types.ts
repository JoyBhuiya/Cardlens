export const TXN_KINDS = [
  "purchase",
  "payment",
  "refund",
  "fee",
  "interest",
  "cash_advance",
  "balance_transfer",
  "other",
] as const;
export type TxnKind = (typeof TXN_KINDS)[number];
export type Direction = "debit" | "credit";

export const KIND_LABELS: Record<TxnKind, string> = {
  purchase: "Purchases",
  payment: "Payments",
  refund: "Refunds",
  fee: "Fees",
  interest: "Interest",
  cash_advance: "Cash advances",
  balance_transfer: "Balance transfers",
  other: "Other",
};

export type StatementStatus = "uploaded" | "extracting" | "processing" | "parsed" | "needs_review" | "failed";

/** A transaction as produced by the pipeline before it is stored. */
export interface PipelineTxn {
  posted_on: string; // ISO yyyy-mm-dd
  description_raw: string;
  merchant: string;
  amount_pence: number; // always positive
  direction: Direction;
  kind: TxnKind;
  category: string;
  category_source: "user_rule" | "dictionary" | "ai" | "kind" | "user" | "system";
  is_business: boolean;
  is_recurring: boolean;
  foreign_currency: boolean;
  dedupe_hash: string;
  ai_kind?: TxnKind;
}

/** A stored transaction row (subset used by analytics). */
export interface TxnRow {
  id?: string;
  card_id: string;
  posted_on: string;
  merchant: string;
  description_raw?: string;
  amount_pence: number;
  direction: Direction;
  kind: TxnKind;
  category: string;
  is_business: boolean;
  is_recurring?: boolean;
  foreign_currency?: boolean;
}

export interface MerchantRule {
  pattern: string;
  merchant: string;
  category: string | null;
  is_business: boolean | null;
}
