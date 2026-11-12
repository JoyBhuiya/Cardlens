import "server-only";
import { userDb } from "@/lib/db";
import type { EntitlementChange } from "./events";

/**
 * Writes an entitlement change as the user it belongs to (RLS). Every write is an upsert keyed by a Stripe id,
 * so applying the same event twice (Stripe retries) changes nothing.
 */
export async function applyChange(change: EntitlementChange): Promise<void> {
  const db = userDb(change.userId);
  switch (change.kind) {
    case "upsert_checkout":
      await db.query(
        `insert into entitlements (user_id, plan, status, source, stripe_customer_id, stripe_checkout_session_id,
                                   stripe_payment_intent_id, current_period_end)
         values ($1, $2, 'active', 'stripe', $3, $4, $5, $6)
         on conflict (stripe_checkout_session_id) do update
           set stripe_customer_id = coalesce(excluded.stripe_customer_id, entitlements.stripe_customer_id),
               stripe_payment_intent_id = coalesce(excluded.stripe_payment_intent_id, entitlements.stripe_payment_intent_id)`,
        [change.userId, change.plan, change.customerId, change.checkoutSessionId, change.paymentIntentId, change.currentPeriodEnd],
      );
      return;
    case "upsert_subscription":
      await db.query(
        `insert into entitlements (user_id, plan, status, source, stripe_customer_id, stripe_subscription_id,
                                   stripe_checkout_session_id, current_period_end, cancel_at_period_end)
         values ($1, $2, $3, 'stripe', $4, $5, $6, $7, $8)
         on conflict (stripe_subscription_id) do update
           set plan = excluded.plan, status = excluded.status, current_period_end = excluded.current_period_end,
               cancel_at_period_end = excluded.cancel_at_period_end,
               stripe_customer_id = coalesce(excluded.stripe_customer_id, entitlements.stripe_customer_id),
               stripe_checkout_session_id = coalesce(entitlements.stripe_checkout_session_id, excluded.stripe_checkout_session_id)`,
        [
          change.userId,
          change.plan,
          change.status,
          change.customerId,
          change.subscriptionId,
          change.checkoutSessionId ?? null,
          change.currentPeriodEnd,
          change.cancelAtPeriodEnd,
        ],
      );
      return;
    case "expire_payment":
      await db.query("update entitlements set status = 'expired' where stripe_payment_intent_id = $1", [change.paymentIntentId]);
      return;
  }
}
