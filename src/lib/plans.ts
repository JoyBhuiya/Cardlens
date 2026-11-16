/**
 * Plans and what each one unlocks. Pure: no database or Stripe, so it is unit-tested directly.
 * Server code gets an Access object from src/lib/entitlements.ts and asks it `can(feature)`.
 */

export type PlanId = "free" | "personal" | "side_business";
export type PaidPlanId = Exclude<PlanId, "free">;

/** Things a plan can unlock. Upload, reconciliation, Statements, Transactions and Overview are always free. */
export type Feature =
  | "insights" // the full Insights page
  | "full_report" // AI summary, saving ideas, every section of the report
  | "pdf" // print/download the report
  | "csv_export" // accountant-ready CSV
  | "business_split"; // business vs personal flag, filter and share

const FEATURES: Record<PlanId, readonly Feature[]> = {
  free: [],
  personal: ["insights", "full_report", "pdf"],
  side_business: ["insights", "full_report", "pdf", "csv_export", "business_split"],
};

const MAX_CARDS: Record<PlanId, number> = { free: 1, personal: 1, side_business: 3 };

/** Higher rank wins when someone holds more than one plan. */
const RANK: Record<PlanId, number> = { free: 0, personal: 1, side_business: 2 };

export interface PlanInfo {
  id: PaidPlanId;
  name: string;
  priceLabel: string;
  unit: string;
  /** Stripe Checkout mode. */
  mode: "payment" | "subscription";
  points: string[];
}

export const PAID_PLANS: readonly PlanInfo[] = [
  {
    id: "personal",
    name: "Annual Report",
    priceLabel: "£9",
    unit: "one-off, 12 months access",
    mode: "payment",
    points: ["Full annual report with AI summary and saving ideas", "Insights: categories, merchants, subscriptions", "PDF download", "1 card"],
  },
  {
    id: "side_business",
    name: "Side-Business",
    priceLabel: "£29",
    unit: "per year",
    mode: "subscription",
    points: ["Everything in Annual Report", "Business vs personal split", "Accountant-ready CSV export", "Up to 3 cards"],
  },
];

export function planName(plan: PlanId): string {
  return plan === "free" ? "Free" : (PAID_PLANS.find((p) => p.id === plan)?.name ?? plan);
}

export interface EntitlementRow {
  plan: PaidPlanId;
  status: "active" | "past_due" | "canceled" | "expired";
  current_period_end: string | null;
}

/**
 * The best plan a user holds right now. A purchase counts while it is active (or past due, which Stripe is
 * still retrying) and its period has not ended. A cancelled subscription keeps working until its period end,
 * because Stripe keeps it "active" with cancel_at_period_end until then.
 */
export function currentPlan(rows: readonly EntitlementRow[], now: Date = new Date()): PlanId {
  let best: PlanId = "free";
  for (const r of rows) {
    if (r.status !== "active" && r.status !== "past_due") continue;
    if (r.current_period_end && new Date(r.current_period_end) <= now) continue;
    if (RANK[r.plan] > RANK[best]) best = r.plan;
  }
  return best;
}

export interface Access {
  plan: PlanId;
  /** False while payments are switched off: everyone gets everything ("early access"). */
  paymentsEnabled: boolean;
  maxCards: number;
  can(feature: Feature): boolean;
}

export function accessFor(plan: PlanId, paymentsEnabled: boolean): Access {
  if (!paymentsEnabled) {
    return { plan, paymentsEnabled, maxCards: Number.POSITIVE_INFINITY, can: () => true };
  }
  const features = FEATURES[plan];
  return { plan, paymentsEnabled, maxCards: MAX_CARDS[plan], can: (f) => features.includes(f) };
}

/** The cheapest paid plan that unlocks a feature, for "Upgrade to …" prompts. */
export function planFor(feature: Feature): PaidPlanId {
  return FEATURES.personal.includes(feature) ? "personal" : "side_business";
}
