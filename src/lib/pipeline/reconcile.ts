import { LIMITS } from "@/lib/env";
import { formatPence } from "@/lib/money";
import type { Direction } from "@/lib/types";

export interface ReconcileInput {
  opening_balance_pence: number | null;
  closing_balance_pence: number | null;
  printed_total_debits_pence: number | null;
  printed_total_credits_pence: number | null;
  transactions: { amount_pence: number; direction: Direction }[];
}

export interface ReconcileResult {
  /** null when the file has no balances to check against (e.g. most CSV exports). */
  reconciled: boolean | null;
  diff_pence: number | null;
  total_debits_pence: number;
  total_credits_pence: number;
  issues: string[];
}

/** opening + debits − credits must equal closing, to the penny. A gap over £1 needs review. */
export function reconcile(input: ReconcileInput): ReconcileResult {
  let debits = 0;
  let credits = 0;
  for (const t of input.transactions) {
    if (t.direction === "debit") debits += t.amount_pence;
    else credits += t.amount_pence;
  }
  const issues: string[] = [];

  if (input.printed_total_debits_pence !== null && input.printed_total_debits_pence !== debits) {
    issues.push(
      `Spending and charges add up to ${formatPence(debits)}, but the statement prints ${formatPence(input.printed_total_debits_pence)}.`,
    );
  }
  if (input.printed_total_credits_pence !== null && input.printed_total_credits_pence !== credits) {
    issues.push(
      `Payments and credits add up to ${formatPence(credits)}, but the statement prints ${formatPence(input.printed_total_credits_pence)}.`,
    );
  }

  if (input.opening_balance_pence === null || input.closing_balance_pence === null) {
    return { reconciled: null, diff_pence: null, total_debits_pence: debits, total_credits_pence: credits, issues };
  }

  const expected = input.opening_balance_pence + debits - credits;
  const diff = input.closing_balance_pence - expected;
  if (diff !== 0) {
    issues.unshift(
      `Opening balance ${formatPence(input.opening_balance_pence)} + charges ${formatPence(debits)} − credits ${formatPence(credits)} = ${formatPence(expected)}, but the closing balance is ${formatPence(input.closing_balance_pence)} (gap ${formatPence(Math.abs(diff))}).`,
    );
  }
  return {
    reconciled: Math.abs(diff) <= LIMITS.reconcileTolerancePence,
    diff_pence: diff,
    total_debits_pence: debits,
    total_credits_pence: credits,
    issues,
  };
}
