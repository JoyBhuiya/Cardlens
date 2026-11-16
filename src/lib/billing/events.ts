/**
 * Turns verified Stripe webhook events into entitlement changes. Pure: no database or network (the one
 * subscription lookup is passed in), so every case is unit-tested with fixture events.
 *
 * Which events matter (configure exactly these on the Stripe webhook endpoint):
 * - checkout.session.completed / checkout.session.async_payment_succeeded: a purchase finished.
 * - customer.subscription.updated / customer.subscription.deleted: renewals, failed payments, cancellations.
 * - charge.refunded: a fully refunded one-off purchase ends its access.
 */
import type Stripe from "stripe";
import type { PaidPlanId } from "@/lib/plans";

export type EntitlementStatus = "active" | "past_due" | "canceled" | "expired";

/** One-off "personal" purchases give 12 months of access from the payment. */
export const ONE_OFF_ACCESS_DAYS = 365;

export type EntitlementChange =
  | {
      kind: "upsert_checkout";
      userId: string;
      plan: PaidPlanId;
      checkoutSessionId: string;
      customerId: string | null;
      paymentIntentId: string | null;
      currentPeriodEnd: string;
    }
  | {
      kind: "upsert_subscription";
      userId: string;
      plan: PaidPlanId;
      subscriptionId: string;
      customerId: string | null;
      status: EntitlementStatus;
      currentPeriodEnd: string | null;
      cancelAtPeriodEnd: boolean;
      checkoutSessionId?: string;
    }
  | { kind: "expire_payment"; userId: string; paymentIntentId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLANS: readonly string[] = ["personal", "side_business"];

function idOf(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

function userIdFrom(meta: Stripe.Metadata | null | undefined, fallback?: string | null): string | null {
  const v = meta?.user_id ?? fallback ?? null;
  return v && UUID.test(v) ? v : null;
}

function planFrom(meta: Stripe.Metadata | null | undefined): PaidPlanId | null {
  const v = meta?.plan;
  return v && PLANS.includes(v) ? (v as PaidPlanId) : null;
}

const iso = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString();

export function subscriptionStatus(s: Stripe.Subscription.Status): EntitlementStatus {
  switch (s) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "incomplete": // first payment not made: no access yet
    case "incomplete_expired":
    case "canceled":
    case "paused":
    default:
      return "canceled";
  }
}

/** Latest period end across the subscription's items (newer Stripe API versions keep it per item). */
export function subscriptionPeriodEnd(sub: Stripe.Subscription): string | null {
  const ends = (sub.items?.data ?? []).map((i) => i.current_period_end).filter((n): n is number => typeof n === "number");
  return ends.length ? iso(Math.max(...ends)) : null;
}

function fromSubscription(sub: Stripe.Subscription, checkoutSessionId?: string): EntitlementChange | null {
  const userId = userIdFrom(sub.metadata);
  const plan = planFrom(sub.metadata);
  if (!userId || !plan) return null;
  return {
    kind: "upsert_subscription",
    userId,
    plan,
    subscriptionId: sub.id,
    customerId: idOf(sub.customer),
    status: subscriptionStatus(sub.status),
    currentPeriodEnd: subscriptionPeriodEnd(sub),
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    ...(checkoutSessionId ? { checkoutSessionId } : {}),
  };
}

/**
 * Returns the change to apply, or null for events that change nothing (unpaid checkout, someone else's
 * product, missing metadata). The lookups are only called when the event itself lacks the data.
 */
export interface StripeLookups {
  getSubscription(id: string): Promise<Stripe.Subscription>;
  getPaymentIntent(id: string): Promise<Stripe.PaymentIntent>;
}

export async function changeFromEvent(event: Stripe.Event, lookups: StripeLookups): Promise<EntitlementChange | null> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.payment_status !== "paid" && s.payment_status !== "no_payment_required") return null; // e.g. bank transfer still pending
      const userId = userIdFrom(s.metadata, s.client_reference_id);
      const plan = planFrom(s.metadata);
      if (!userId || !plan) return null;
      if (s.mode === "subscription") {
        const subId = idOf(s.subscription);
        if (!subId) return null;
        const sub = await lookups.getSubscription(subId);
        // Metadata is set on the subscription at checkout; fall back to the session's if it's missing.
        const change = fromSubscription({ ...sub, metadata: { ...s.metadata, ...sub.metadata } } as Stripe.Subscription, s.id);
        return change;
      }
      if (s.mode === "payment") {
        return {
          kind: "upsert_checkout",
          userId,
          plan,
          checkoutSessionId: s.id,
          customerId: idOf(s.customer),
          paymentIntentId: idOf(s.payment_intent),
          currentPeriodEnd: iso(s.created + ONE_OFF_ACCESS_DAYS * 86400),
        };
      }
      return null;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      // Events can arrive out of order; re-read the subscription so we always store its latest state.
      const sub = await lookups.getSubscription((event.data.object as Stripe.Subscription).id);
      return fromSubscription(sub);
    }
    case "customer.subscription.deleted": {
      const change = fromSubscription(event.data.object as Stripe.Subscription);
      if (change && change.kind === "upsert_subscription") change.status = "canceled";
      return change;
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId = idOf(charge.payment_intent);
      // Only a full refund ends access; partial refunds (goodwill) keep it.
      if (!paymentIntentId || !charge.refunded) return null;
      // Checkout puts the user id on the payment intent's metadata; read it from there if the charge lacks it.
      let userId = userIdFrom(charge.metadata);
      if (!userId) userId = userIdFrom((await lookups.getPaymentIntent(paymentIntentId)).metadata);
      if (!userId) return null;
      return { kind: "expire_payment", userId, paymentIntentId };
    }
    default:
      return null;
  }
}
