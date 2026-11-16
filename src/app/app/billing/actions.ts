"use server";

import type Stripe from "stripe";
import { z } from "zod";
import { stripe } from "@/lib/billing/stripe";
import { getAccess } from "@/lib/entitlements";
import { serverEnv } from "@/lib/env";
import { PAID_PLANS } from "@/lib/plans";
import { requireUser } from "@/lib/session";

const Plan = z.enum(["personal", "side_business"]);
type Result = { url?: string; error?: string };

async function existingCustomer(db: Awaited<ReturnType<typeof requireUser>>["db"]): Promise<string | null> {
  const row = await db.one<{ id: string }>(
    "select stripe_customer_id as id from entitlements where stripe_customer_id is not null order by created_at desc limit 1",
  );
  return row?.id ?? null;
}

/** Starts Stripe Checkout for a plan and returns its URL (the browser goes there). */
export async function startCheckout(planInput: string): Promise<Result> {
  if (!serverEnv.paymentsEnabled()) return { error: "Paid plans aren't available yet. Everything is free during early access." };
  const plan = Plan.safeParse(planInput);
  if (!plan.success) return { error: "Unknown plan." };
  const info = PAID_PLANS.find((p) => p.id === plan.data)!;
  const { db, user } = await requireUser();
  const access = await getAccess(db);
  if (access.plan === "side_business" || access.plan === plan.data) return { error: `You already have the ${info.name} plan.` };

  const site = serverEnv.siteUrl();
  const customer = await existingCustomer(db);
  const meta = { user_id: user.id, plan: plan.data };
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: info.mode,
    line_items: [{ price: serverEnv.stripePrice(plan.data), quantity: 1 }],
    client_reference_id: user.id,
    metadata: meta,
    success_url: `${site}/app/billing?checkout=success`,
    cancel_url: `${site}/app/billing?checkout=cancelled`,
    allow_promotion_codes: true, // early-bird codes for the waitlist
    // UK Consumer Contracts Regulations: digital content supplied at once needs the buyer's acknowledgement
    // that the 14-day cancellation right ends. Shown next to the Pay button. (Wording pending legal review.)
    custom_text: {
      submit: {
        message:
          info.mode === "payment"
            ? "Your report unlocks straight away. By paying you agree to immediate access and acknowledge you lose the 14-day right to cancel."
            : "Your plan starts straight away and renews yearly until you cancel. By paying you agree to immediate access.",
      },
    },
    ...(customer ? { customer } : { customer_email: user.email }),
    ...(info.mode === "payment"
      ? {
          ...(customer ? {} : { customer_creation: "always" as const }),
          payment_intent_data: { metadata: meta },
          invoice_creation: { enabled: true }, // a receipt/invoice for the one-off purchase
        }
      : { subscription_data: { metadata: meta } }),
  };
  try {
    const session = await stripe().checkout.sessions.create(params);
    return session.url ? { url: session.url } : { error: "Could not start checkout. Please try again." };
  } catch (err) {
    console.error("checkout failed", err instanceof Error ? err.message : err);
    return { error: "Could not start checkout. Please try again." };
  }
}

/** Stripe's customer portal: invoices, card details, cancel the subscription. */
export async function openBillingPortal(): Promise<Result> {
  const { db } = await requireUser();
  const customer = await existingCustomer(db);
  if (!customer) return { error: "No billing account yet." };
  try {
    const session = await stripe().billingPortal.sessions.create({ customer, return_url: `${serverEnv.siteUrl()}/app/billing` });
    return { url: session.url };
  } catch (err) {
    console.error("billing portal failed", err instanceof Error ? err.message : err);
    return { error: "Could not open billing. Please try again." };
  }
}
