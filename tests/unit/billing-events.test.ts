import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { changeFromEvent, ONE_OFF_ACCESS_DAYS, subscriptionStatus, type StripeLookups } from "@/lib/billing/events";

const USER = "6f0c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f";
const CREATED = 1_794_400_000; // unix seconds

function event(type: string, object: unknown): Stripe.Event {
  return { id: `evt_${type}`, type, created: CREATED, data: { object } } as unknown as Stripe.Event;
}

function subscription(over: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: "sub_1",
    status: "active",
    customer: "cus_1",
    cancel_at_period_end: false,
    metadata: { user_id: USER, plan: "side_business" },
    items: { data: [{ current_period_end: CREATED + 365 * 86400 }] },
    ...over,
  } as unknown as Stripe.Subscription;
}

function lookups(sub = subscription(), piMeta: Record<string, string> = { user_id: USER }): StripeLookups & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    getSubscription: vi.fn(async (id: string) => {
      calls.push(`sub:${id}`);
      return sub;
    }),
    getPaymentIntent: vi.fn(async (id: string) => {
      calls.push(`pi:${id}`);
      return { id, metadata: piMeta } as unknown as Stripe.PaymentIntent;
    }),
  };
}

const iso = (s: number) => new Date(s * 1000).toISOString();

describe("Stripe events → entitlement changes", () => {
  it("one-off £9 checkout: 12 months of personal access, keyed by the checkout session", async () => {
    const e = event("checkout.session.completed", {
      id: "cs_1",
      mode: "payment",
      payment_status: "paid",
      client_reference_id: USER,
      metadata: { user_id: USER, plan: "personal" },
      customer: "cus_1",
      payment_intent: "pi_1",
      created: CREATED,
    });
    expect(await changeFromEvent(e, lookups())).toEqual({
      kind: "upsert_checkout",
      userId: USER,
      plan: "personal",
      checkoutSessionId: "cs_1",
      customerId: "cus_1",
      paymentIntentId: "pi_1",
      currentPeriodEnd: iso(CREATED + ONE_OFF_ACCESS_DAYS * 86400),
    });
  });

  it("subscription checkout: reads the subscription for status and period end", async () => {
    const l = lookups();
    const e = event("checkout.session.completed", {
      id: "cs_2",
      mode: "subscription",
      payment_status: "paid",
      metadata: { user_id: USER, plan: "side_business" },
      subscription: "sub_1",
      created: CREATED,
    });
    expect(await changeFromEvent(e, l)).toMatchObject({
      kind: "upsert_subscription",
      userId: USER,
      plan: "side_business",
      subscriptionId: "sub_1",
      status: "active",
      currentPeriodEnd: iso(CREATED + 365 * 86400),
      checkoutSessionId: "cs_2",
    });
    expect(l.calls).toEqual(["sub:sub_1"]);
  });

  it("ignores unpaid checkouts (e.g. a bank transfer still pending) and missing or bad metadata", async () => {
    const base = { id: "cs_3", mode: "payment", created: CREATED, payment_intent: "pi_3" };
    expect(await changeFromEvent(event("checkout.session.completed", { ...base, payment_status: "unpaid", metadata: { user_id: USER, plan: "personal" } }), lookups())).toBeNull();
    expect(await changeFromEvent(event("checkout.session.completed", { ...base, payment_status: "paid", metadata: {} }), lookups())).toBeNull();
    expect(await changeFromEvent(event("checkout.session.completed", { ...base, payment_status: "paid", metadata: { user_id: "not-a-uuid", plan: "personal" } }), lookups())).toBeNull();
    expect(await changeFromEvent(event("checkout.session.completed", { ...base, payment_status: "paid", metadata: { user_id: USER, plan: "pro" } }), lookups())).toBeNull();
  });

  it("subscription updates re-read the latest state from Stripe (out-of-order events)", async () => {
    const latest = subscription({ status: "past_due", cancel_at_period_end: true });
    const l = lookups(latest);
    const change = await changeFromEvent(event("customer.subscription.updated", subscription({ status: "active" })), l);
    expect(change).toMatchObject({ kind: "upsert_subscription", status: "past_due", cancelAtPeriodEnd: true });
    expect(l.calls).toEqual(["sub:sub_1"]);
  });

  it("a deleted subscription is cancelled", async () => {
    expect(await changeFromEvent(event("customer.subscription.deleted", subscription({ status: "canceled" })), lookups())).toMatchObject({ status: "canceled" });
  });

  it("a full refund ends one-off access; partial refunds don't", async () => {
    const l = lookups();
    expect(await changeFromEvent(event("charge.refunded", { payment_intent: "pi_1", refunded: true, metadata: {} }), l)).toEqual({
      kind: "expire_payment",
      userId: USER,
      paymentIntentId: "pi_1",
    });
    expect(l.calls).toEqual(["pi:pi_1"]);
    expect(await changeFromEvent(event("charge.refunded", { payment_intent: "pi_1", refunded: false, metadata: {} }), lookups())).toBeNull();
  });

  it("ignores events it doesn't handle", async () => {
    expect(await changeFromEvent(event("invoice.paid", {}), lookups())).toBeNull();
  });

  it("maps Stripe subscription statuses", () => {
    expect(subscriptionStatus("active")).toBe("active");
    expect(subscriptionStatus("trialing")).toBe("active");
    expect(subscriptionStatus("past_due")).toBe("past_due");
    expect(subscriptionStatus("unpaid")).toBe("past_due");
    expect(subscriptionStatus("incomplete")).toBe("canceled");
    expect(subscriptionStatus("canceled")).toBe("canceled");
  });
});
