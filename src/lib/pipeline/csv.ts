import Papa from "papaparse";
import { toPence } from "@/lib/money";
import { toIsoDate } from "./normalise";
import type { Direction } from "@/lib/types";

export interface CsvTxn {
  posted_on: string;
  description_raw: string;
  amount_pence: number;
  direction: Direction;
}

export interface CsvMapping {
  date: string;
  description: string;
  amount?: string;
  debit?: string;
  credit?: string;
  /** For single-amount files: does a positive number mean a charge (debit)? */
  positiveIsDebit?: boolean;
}

export interface CsvResult {
  mapping: CsvMapping;
  transactions: CsvTxn[];
  period_start: string | null;
  period_end: string | null;
  skipped: number;
}

const DATE_RE = /^(transaction date|date|posted|posting date|trans date|transaction posted date)/i;
const DESC_RE = /(description|details|merchant|narrative|transaction|payee|reference)/i;
const AMOUNT_RE = /^(amount|value|amount \(gbp\)|amount gbp|billing amount|£)/i;
const DEBIT_RE = /(debit|paid out|money out|charge|spend)/i;
const CREDIT_RE = /(credit|paid in|money in|payment)/i;

/** Column-mapping step: pick date, description and amount columns from the header row. */
export function detectMapping(headers: string[], rows: Record<string, string>[]): CsvMapping | null {
  const h = headers.map((x) => x.trim());
  const date = h.find((x) => DATE_RE.test(x)) ?? h.find((x) => /date/i.test(x));
  const amount = h.find((x) => AMOUNT_RE.test(x));
  const debit = amount ? undefined : h.find((x) => DEBIT_RE.test(x) && x !== date);
  const credit = amount ? undefined : h.find((x) => CREDIT_RE.test(x) && x !== date && x !== debit);
  const description = h.find((x) => DESC_RE.test(x) && x !== date && x !== amount && x !== debit && x !== credit);
  if (!date || !description || (!amount && !debit)) return null;

  let positiveIsDebit = true;
  if (amount) {
    // Card exports differ: Amex shows charges positive, some banks show them negative.
    // Charges far outnumber credits, so the majority sign is the charge sign.
    let pos = 0;
    let neg = 0;
    for (const r of rows.slice(0, 500)) {
      const p = toPence(r[amount]);
      if (p === null || p === 0) continue;
      if (p > 0) pos++;
      else neg++;
    }
    positiveIsDebit = pos >= neg;
  }
  return { date, description, amount, debit, credit, positiveIsDebit };
}

export function parseStatementCsv(text: string, mapping?: CsvMapping): CsvResult {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (x) => x.trim(),
  });
  const headers = parsed.meta.fields ?? [];
  const map = mapping ?? detectMapping(headers, parsed.data);
  if (!map) {
    throw new Error(
      `Could not find date, description and amount columns in this CSV. Columns found: ${headers.join(", ") || "none"}.`,
    );
  }

  const transactions: CsvTxn[] = [];
  let skipped = 0;
  for (const row of parsed.data) {
    const iso = toIsoDate(String(row[map.date] ?? ""));
    const desc = String(row[map.description] ?? "").trim();
    let pence: number | null = null;
    let direction: Direction = "debit";
    if (map.amount) {
      const p = toPence(row[map.amount]);
      if (p !== null) {
        const isDebit = map.positiveIsDebit ? p > 0 : p < 0;
        direction = isDebit ? "debit" : "credit";
        pence = Math.abs(p);
      }
    } else {
      const d = map.debit ? toPence(row[map.debit]) : null;
      const c = map.credit ? toPence(row[map.credit]) : null;
      if (d) {
        pence = Math.abs(d);
        direction = "debit";
      } else if (c) {
        pence = Math.abs(c);
        direction = "credit";
      }
    }
    if (!iso || !desc || !pence) {
      skipped++;
      continue;
    }
    transactions.push({ posted_on: iso, description_raw: desc, amount_pence: pence, direction });
  }

  const dates = transactions.map((t) => t.posted_on).sort();
  return {
    mapping: map,
    transactions,
    period_start: dates[0] ?? null,
    period_end: dates[dates.length - 1] ?? null,
    skipped,
  };
}
