import type { Direction, TxnKind } from "@/lib/types";

const PAYMENT = /\b(PAYMENT RECEIVED|PAYMENT - THANK YOU|PAYMENT THANK YOU|THANK YOU FOR YOUR PAYMENT|DIRECT DEBIT|DD PAYMENT|PAYMENT BY DIRECT DEBIT|FASTER PAYMENT|BANK PAYMENT|PAYMENT RECD|ONLINE PAYMENT)\b|^PAYMENT\b/;
const INTEREST = /\bINTEREST\b/;
const FEE = /\b(LATE (PAYMENT )?FEE|OVER ?LIMIT( FEE)?|ANNUAL (CARD )?FEE|MONTHLY (ACCOUNT )?FEE|NON[- ]?STERLING (TRANSACTION )?FEE|FOREIGN (TRANSACTION|EXCHANGE|USAGE) FEE|CASH (ADVANCE |TRANSACTION )?FEE|HANDLING FEE|RETURNED PAYMENT FEE|DEFAULT FEE|BALANCE TRANSFER FEE|ACCOUNT FEE)\b/;
const CASH = /\b(CASH ADVANCE|CASH WITHDRAWAL|ATM|CASH MACHINE|CASH \d|GAMBLING|BUREAU DE CHANGE)\b/;
const BALANCE_TRANSFER = /\bBALANCE TRANSFER\b/;

const DEBIT_KINDS: TxnKind[] = ["purchase", "fee", "interest", "cash_advance", "balance_transfer", "other"];

/**
 * Rules first, Claude's kind as fallback.
 * Credits are payments if the text says so, otherwise refunds ("negative purchase → refund").
 */
export function classifyKind(description: string, direction: Direction, aiKind?: TxnKind | null): TxnKind {
  const d = description.toUpperCase();
  if (direction === "credit") {
    if (PAYMENT.test(d)) return "payment";
    if (aiKind === "payment") return "payment";
    return "refund";
  }
  if (FEE.test(d)) return "fee"; // before balance transfer / cash so "CASH ADVANCE FEE" is a fee
  if (INTEREST.test(d)) return "interest";
  if (BALANCE_TRANSFER.test(d)) return "balance_transfer";
  if (CASH.test(d)) return "cash_advance";
  if (aiKind && DEBIT_KINDS.includes(aiKind)) return aiKind;
  return "purchase";
}

/** Categories implied by the kind alone (purchases and refunds are categorised by merchant). */
export function categoryForKind(kind: TxnKind): string | null {
  switch (kind) {
    case "payment":
      return "payments";
    case "fee":
    case "interest":
      return "fees_interest";
    case "cash_advance":
      return "cash";
    case "balance_transfer":
      return "transfers";
    default:
      return null;
  }
}
