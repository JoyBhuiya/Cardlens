import { z } from "zod";
import { TXN_KINDS } from "@/lib/types";

/**
 * What Claude must return for a statement PDF. Amounts are positive pounds with an explicit
 * direction, so sign conventions of different banks never matter.
 * The JSON Schema export lives at schemas/statement-extraction.schema.json (npm run schemas).
 */
export const ExtractedTransaction = z.object({
  date: z.string().describe("Transaction or posting date exactly as printed, or ISO yyyy-mm-dd if unambiguous"),
  description: z.string().describe("Full description line as printed, including merchant and location"),
  amount: z.number().describe("Amount in pounds, always positive"),
  direction: z
    .enum(["debit", "credit"])
    .describe("debit = increases what is owed (purchases, fees, interest, cash); credit = reduces it (payments, refunds)"),
  kind: z.enum(TXN_KINDS).describe("Best guess at the transaction type"),
  foreign_currency: z.boolean().describe("True if the line shows a non-sterling amount or exchange rate"),
});

export const StatementExtraction = z.object({
  issuer: z.string().nullable().describe("Card issuer or bank name, e.g. Barclaycard, American Express"),
  card_last4: z.string().nullable().describe("Last 4 digits of the card number only, never the full number"),
  period_start: z.string().nullable().describe("Statement period start date, ISO yyyy-mm-dd"),
  period_end: z.string().nullable().describe("Statement period end / statement date, ISO yyyy-mm-dd"),
  opening_balance: z
    .number()
    .nullable()
    .describe("Previous/opening balance in pounds. Positive when money is owed; negative if the account was in credit"),
  closing_balance: z
    .number()
    .nullable()
    .describe("New/closing balance in pounds. Positive when money is owed; negative if in credit"),
  printed_total_debits: z
    .number()
    .nullable()
    .describe("Printed total of new spending, fees and interest for the period if the statement shows one"),
  printed_total_credits: z
    .number()
    .nullable()
    .describe("Printed total of payments and credits for the period if the statement shows one"),
  currency: z.string().describe("Statement currency code, normally GBP"),
  transactions: z.array(ExtractedTransaction),
});

export type StatementExtraction = z.infer<typeof StatementExtraction>;
export type ExtractedTransaction = z.infer<typeof ExtractedTransaction>;
