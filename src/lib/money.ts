/** Money helpers. All amounts are integer pence. */

/** Parse "£1,234.56", "1234.5", "-12.00", "12.00 CR", "(12.00)" to pence. Returns null if not a number. */
export function toPence(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    return Math.round(input * 100);
  }
  let s = input.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/\bCR\b\.?$/i.test(s)) {
    negative = true;
    s = s.replace(/\bCR\b\.?$/i, "");
  }
  s = s.replace(/\bDR\b\.?$/i, "");
  s = s.replace(/[£$€,\s]/g, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s) && !/^\.\d{1,2}$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const pence = Number(whole || "0") * 100 + Number((frac + "00").slice(0, 2));
  return negative ? -pence : pence;
}

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const gbpWhole = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

export function formatPence(pence: number | null | undefined, opts: { whole?: boolean } = {}): string {
  if (pence === null || pence === undefined) return "—";
  return (opts.whole ? gbpWhole : gbp).format(pence / 100);
}

export function sumPence(values: Iterable<number>): number {
  let t = 0;
  for (const v of values) t += v;
  return t;
}
