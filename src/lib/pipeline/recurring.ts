import { LIMITS } from "@/lib/env";
import { median, monthKey } from "@/lib/utils";

export interface RecurringCharge {
  merchant: string;
  category: string;
  typical_pence: number;
  months_seen: number;
  annual_cost_pence: number;
}

interface RecurringInput {
  merchant: string;
  category: string;
  amount_pence: number;
  posted_on: string;
  kind: string;
}

/**
 * A charge is recurring when the same merchant and a similar amount (±20% of the typical, allowing a price rise
 * amount) appear in 3 or more distinct months. Annual cost = typical amount × 12.
 */
export function detectRecurring(txns: RecurringInput[]): RecurringCharge[] {
  const byMerchant = new Map<string, RecurringInput[]>();
  for (const t of txns) {
    if (t.kind !== "purchase") continue;
    const list = byMerchant.get(t.merchant) ?? [];
    list.push(t);
    byMerchant.set(t.merchant, list);
  }
  const out: RecurringCharge[] = [];
  for (const [merchant, list] of byMerchant) {
    if (list.length < LIMITS.recurringMinMonths) continue;
    // Most common amount band: try each distinct amount as the centre, keep the band seen in most months.
    let best: { centre: number; months: Set<string>; members: RecurringInput[] } | null = null;
    const centres = [...new Set(list.map((t) => t.amount_pence))];
    for (const c of centres) {
      const members = list.filter((t) => Math.abs(t.amount_pence - c) <= Math.max(c * 0.2, 50));
      const months = new Set(members.map((t) => monthKey(t.posted_on)));
      if (!best || months.size > best.months.size) best = { centre: c, months, members };
    }
    if (!best || best.months.size < LIMITS.recurringMinMonths) continue;
    // Many charges a month (e.g. daily coffee) isn't a subscription.
    if (best.members.length > best.months.size * 1.5) continue;
    const typical = Math.round(median(best.members.map((t) => t.amount_pence)));
    out.push({
      merchant,
      category: best.members[0].category,
      typical_pence: typical,
      months_seen: best.months.size,
      annual_cost_pence: typical * 12,
    });
  }
  return out.sort((a, b) => b.annual_cost_pence - a.annual_cost_pence);
}
