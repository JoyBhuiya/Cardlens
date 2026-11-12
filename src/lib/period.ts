/**
 * Report periods. Pure, unit-tested.
 * - "2026"       calendar year 1 Jan – 31 Dec 2026
 * - "tax-2025"   UK tax year 6 Apr 2025 – 5 Apr 2026
 * - "m-2025-11"  any 12 months: 1 Nov 2025 – 31 Oct 2026
 */

export type PeriodKind = "calendar" | "tax" | "months";

export interface Period {
  key: string;
  kind: PeriodKind;
  /** Inclusive ISO dates. */
  start: string;
  end: string;
  /** "2026", "2025/26 tax year", "Nov 2025 – Oct 2026" */
  label: string;
  /** Short label for buttons: "2026", "2025/26", "Nov 25–Oct 26" */
  short: string;
  /** Year the period starts in (kept in reports.year). */
  startYear: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const validYear = (y: number) => Number.isInteger(y) && y >= 2000 && y <= 2099;

function lastDay(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based; day 0 of next month
}

export function calendarYear(y: number): Period {
  return { key: String(y), kind: "calendar", start: `${y}-01-01`, end: `${y}-12-31`, label: String(y), short: String(y), startYear: y };
}

export function taxYear(y: number): Period {
  const yy = `${y}/${String((y + 1) % 100).padStart(2, "0")}`;
  return { key: `tax-${y}`, kind: "tax", start: `${y}-04-06`, end: `${y + 1}-04-05`, label: `${yy} tax year`, short: yy, startYear: y };
}

/** 12 months starting on the 1st of month m (1–12) of year y. */
export function twelveMonths(y: number, m: number): Period {
  const endM = ((m + 10) % 12) + 1;
  const endY = m === 1 ? y : y + 1;
  const label = `${MONTHS[m - 1]} ${y} – ${MONTHS[endM - 1]} ${endY}`;
  return {
    key: `m-${y}-${pad(m)}`,
    kind: "months",
    start: `${y}-${pad(m)}-01`,
    end: `${endY}-${pad(endM)}-${pad(lastDay(endY, endM))}`,
    label,
    short: `${MONTHS[m - 1]} ${String(y).slice(2)}–${MONTHS[endM - 1]} ${String(endY).slice(2)}`,
    startYear: y,
  };
}

export function parsePeriodKey(key: string): Period | null {
  let m = /^(\d{4})$/.exec(key);
  if (m && validYear(+m[1])) return calendarYear(+m[1]);
  m = /^tax-(\d{4})$/.exec(key);
  if (m && validYear(+m[1])) return taxYear(+m[1]);
  m = /^m-(\d{4})-(\d{2})$/.exec(key);
  if (m && validYear(+m[1]) && +m[2] >= 1 && +m[2] <= 12) return twelveMonths(+m[1], +m[2]);
  return null;
}

/** The UK tax year (by start year) a date falls in. */
export function taxYearOf(iso: string): number {
  const y = Number(iso.slice(0, 4));
  return iso.slice(5) >= "04-06" ? y : y - 1;
}

export function overlaps(p: Period, first: string, last: string): boolean {
  return p.start <= last && p.end >= first;
}

/** Calendar and tax years that contain at least one transaction, newest first. */
export function availablePeriods(first: string | null, last: string | null): { calendar: Period[]; tax: Period[] } {
  if (!first || !last) return { calendar: [], tax: [] };
  const calendar: Period[] = [];
  for (let y = Number(last.slice(0, 4)); y >= Number(first.slice(0, 4)); y--) calendar.push(calendarYear(y));
  const tax: Period[] = [];
  for (let y = taxYearOf(last); y >= taxYearOf(first); y--) tax.push(taxYear(y));
  return { calendar, tax };
}

/** Month options ("2025-11") for the "any 12 months" picker: every month that starts within the data. */
export function monthStarts(first: string | null, last: string | null): { value: string; label: string }[] {
  if (!first || !last) return [];
  const out: { value: string; label: string }[] = [];
  let y = Number(last.slice(0, 4));
  let mo = Number(last.slice(5, 7));
  const fy = Number(first.slice(0, 4));
  const fm = Number(first.slice(5, 7));
  while (y > fy || (y === fy && mo >= fm)) {
    out.push({ value: `m-${y}-${pad(mo)}`, label: `${MONTHS[mo - 1]} ${y}` });
    mo--;
    if (mo === 0) {
      mo = 12;
      y--;
    }
  }
  return out;
}

export function inPeriod(iso: string, p: Pick<Period, "start" | "end">): boolean {
  return iso >= p.start && iso <= p.end;
}
