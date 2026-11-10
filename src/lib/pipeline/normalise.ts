import aliases from "@/data/merchant-aliases.json";
import type { MerchantRule } from "@/lib/types";

/** Replace any 12–19 digit card number (spaces or dashes allowed) with "••••1234". */
export function maskCardNumbers(text: string): string {
  return text.replace(/\b(?:\d[ -]?){11,18}\d\b/g, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 12 || digits.length > 19) return match;
    return `••••${digits.slice(-4)}`;
  });
}

/** Keep only a valid last-4. */
export function safeLast4(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function valid(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Convert a UK-style date to ISO. Handles yyyy-mm-dd, dd/mm/yyyy, dd/mm/yy, dd-mm-yyyy,
 * "12 Mar 2026", "12 Mar 26" and "12 Mar" (year inferred from the statement period).
 */
export function toIsoDate(input: string, period?: { start?: string | null; end?: string | null }): string | null {
  const s = input.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return valid(y, +m[2], +m[1]);
  }

  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})\.?(?:[\s-]+(\d{2,4}))?$/);
  if (m) {
    const mon = MONTHS[m[2].slice(0, 4).toLowerCase()] ?? MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (!mon) return null;
    if (m[3]) {
      const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      return valid(y, mon, +m[1]);
    }
    return inferYear(+m[1], mon, period);
  }
  return null;
}

function inferYear(day: number, month: number, period?: { start?: string | null; end?: string | null }): string | null {
  const end = period?.end ?? period?.start;
  if (!end) return null;
  const endY = +end.slice(0, 4);
  const endM = +end.slice(5, 7);
  // A month later than the period end month belongs to the previous year (period crosses 31 Dec).
  const year = month > endM + 1 ? endY - 1 : endY;
  return valid(year, month, day);
}

/** Uppercase, collapse whitespace, strip reference noise for matching and hashing. */
export function normaliseDescription(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

interface Alias {
  match: string;
  merchant: string;
  category: string;
}
function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/** Match a pattern as a whole token so "O2" never matches inside "AB1O2X". */
export function tokenRegex(pattern: string): RegExp {
  return new RegExp(`(?<![A-Z0-9])${escapeRe(pattern.toUpperCase().trim())}(?![A-Z0-9])`);
}
const ALIASES = (aliases as Alias[]).map((a) => ({ ...a, re: tokenRegex(a.match) }));

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\bUk\b/g, "UK");
}

/** Strip processor prefixes, refs, locations and long numbers from a raw description to a readable name. */
export function heuristicMerchant(raw: string): string {
  let s = normaliseDescription(raw);
  s = s.replace(/^(SQ|SUMUP|ZTL|IZ|PAYPAL|PP|CRV|SP|TST|GOOGLE|APPLE PAY|CKO|LSP|WWW)\s*\*\s*/i, "");
  s = s.replace(/^(SQ|SUMUP|IZ)\s+\*?/i, "");
  s = s.split("*")[0];
  s = s.replace(/\bWWW\.|\.(CO\.UK|COM|UK|NET|ORG)\b.*$/g, "");
  s = s.replace(/\b(GB|GBR|UK|LONDON|MANCHESTER|BIRMINGHAM|LEEDS|GLASGOW|EDINBURGH|BRISTOL|CARD PAYMENT|CONTACTLESS|ONLINE|INTERNET)\b.*$/g, "");
  s = s.replace(/\b[A-Z]*\d[\dA-Z]{3,}\b/g, ""); // reference codes
  s = s.replace(/\d{5,}/g, "");
  s = s.replace(/[^A-Z0-9&' -]/g, " ").replace(/\s+/g, " ").trim();
  if (s.length < 2) s = normaliseDescription(raw).slice(0, 40);
  return titleCase(s);
}

export interface MerchantMatch {
  merchant: string;
  category: string | null;
  is_business: boolean | null;
  source: "user_rule" | "dictionary" | "heuristic";
}

/** merchant_rules first, then the built-in alias dictionary, then a heuristic clean-up. */
export function resolveMerchant(raw: string, rules: MerchantRule[]): MerchantMatch {
  const norm = normaliseDescription(raw);
  // Longest pattern wins so "AMAZON PRIME" beats "AMAZON".
  const userRule = [...rules]
    .sort((a, b) => b.pattern.length - a.pattern.length)
    .find((r) => norm.includes(r.pattern.toUpperCase()));
  if (userRule) {
    return { merchant: userRule.merchant, category: userRule.category, is_business: userRule.is_business, source: "user_rule" };
  }
  const alias = ALIASES.find((a) => a.re.test(norm));
  if (alias) return { merchant: alias.merchant, category: alias.category, is_business: null, source: "dictionary" };
  return { merchant: heuristicMerchant(raw), category: null, is_business: null, source: "heuristic" };
}
