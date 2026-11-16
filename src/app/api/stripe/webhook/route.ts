import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { anonDb } from "@/lib/db";
import { applyChange } from "@/lib/billing/apply";
import { changeFromEvent } from "@/lib/billing/events";
import { stripe } from "@/lib/billing/stripe";
import { serverEnv } from "@/lib/env";

export const runtime = "nodejs";

/**
 * Stripe webhook. Verifies the signature on the raw body, skips events already applied, turns the event into
 * an entitlement change and stores it. Runs whether or not PAYMENTS_ENABLED is on, so sandbox purchases can be
 * checked before launch.
 *
 * Once the signature is verified it always answers 200, even when applying the event fails: 5xx makes Stripe
 * retry for days and pile up deliveries. A failed event is logged ("stripe webhook failed") and NOT recorded
 * in stripe_events, so "Resend" in the Stripe Dashboard applies it once the cause is fixed.
 */
export async function POST(request: Request) {
  let secret: string;
  try {
    secret = serverEnv.stripeWebhookSecret();
  } catch {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (await anonDb.one("select 1 from stripe_events where id = $1", [event.id])) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    const change = await changeFromEvent(event, {
      getSubscription: (id) => stripe().subscriptions.retrieve(id),
      getPaymentIntent: (id) => stripe().paymentIntents.retrieve(id),
    });
    if (change) await applyChange(change);
    await anonDb.query("insert into stripe_events (id, type) values ($1, $2) on conflict (id) do nothing", [event.id, event.type]);
    return NextResponse.json({ received: true, applied: Boolean(change) });
  } catch (err) {
    // A deleted account can't receive an entitlement (foreign key): acknowledge so Stripe stops retrying.
    if (err instanceof Error && /foreign key/i.test(err.message)) {
      await anonDb.query("insert into stripe_events (id, type) values ($1, $2) on conflict (id) do nothing", [event.id, event.type]);
      return NextResponse.json({ received: true, applied: false });
    }
    console.error("stripe webhook failed", event.id, event.type, err instanceof Error ? err.message : err);
    return NextResponse.json({ received: true, applied: false });
  }
}
