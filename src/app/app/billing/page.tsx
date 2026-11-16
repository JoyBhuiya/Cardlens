import type { Metadata } from "next";
import { AutoRefresh } from "@/components/auto-refresh";
import { CheckoutButton, PortalButton } from "@/components/billing-buttons";
import { PlanComparison } from "@/components/plan-comparison";
import { Card, PageHeader } from "@/components/ui";
import { getAccess } from "@/lib/entitlements";
import { PAID_PLANS, planName, type PlanId } from "@/lib/plans";
import { requireUser } from "@/lib/session";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Plan & billing" };

interface EntitlementView {
  plan: "personal" | "side_business";
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const { checkout } = await searchParams;
  const { db } = await requireUser();
  const [access, rows] = await Promise.all([
    getAccess(db),
    db.query<EntitlementView>(
      `select plan, status, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id
       from entitlements order by created_at desc`,
    ),
  ]);
  const current = rows.find((r) => r.plan === access.plan && (r.status === "active" || r.status === "past_due"));
  const hasBilling = rows.some((r) => r.stripe_customer_id);
  // Back from Stripe before the webhook has landed: keep refreshing until the plan shows up.
  const confirming = checkout === "success" && access.plan === "free" && access.paymentsEnabled;

  return (
    <>
      <PageHeader title="Plan & billing" description={access.paymentsEnabled ? `You're on the ${planName(access.plan)} plan.` : undefined} />
      <AutoRefresh active={confirming} everyMs={3000} />

      {!access.paymentsEnabled ? (
        <Card className="mb-6 border-brand/40 bg-brand-soft/40 p-5 text-[15px]" role="status">
          <strong>Early access:</strong> every feature is free while Cardlens is in early access. Paid plans start later; the prices below are planned
          launch prices, and waitlist members get an early-bird discount.
        </Card>
      ) : null}
      {checkout === "success" ? (
        <Card className="mb-6 p-5 text-[15px]" role="status">
          {confirming ? "Payment received. Confirming your plan…" : "Thank you. Your plan is active."}
        </Card>
      ) : null}
      {checkout === "cancelled" ? (
        <Card className="mb-6 p-5 text-[15px]" role="status">
          Checkout was cancelled. You haven&apos;t been charged.
        </Card>
      ) : null}

      {access.paymentsEnabled && current ? (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex flex-col gap-1">
            <span className="font-display text-lg font-semibold">{planName(current.plan)}</span>
            <span className="text-sm text-muted">
              {current.status === "past_due"
                ? "Your last payment failed. Update your card to keep access."
                : current.stripe_subscription_id
                  ? current.cancel_at_period_end
                    ? `Cancelled. Access ends on ${formatDate(current.current_period_end)}.`
                    : `Renews on ${formatDate(current.current_period_end)}.`
                  : `Access until ${formatDate(current.current_period_end)}.`}
            </span>
          </div>
          {hasBilling ? <PortalButton /> : null}
        </Card>
      ) : access.paymentsEnabled && hasBilling ? (
        <div className="mb-6">
          <PortalButton />
        </div>
      ) : null}

      <PlanComparison
        current={access.paymentsEnabled ? access.plan : undefined}
        actions={Object.fromEntries(
          PAID_PLANS.map((p) => [
            p.id,
            !access.paymentsEnabled ? (
              <span className="text-sm font-semibold text-muted">Available at launch</span>
            ) : canBuy(access.plan, p.id) ? (
              <CheckoutButton
                plan={p.id}
                label={access.plan === "personal" && p.id === "side_business" ? "Upgrade" : p.mode === "payment" ? `Buy for ${p.priceLabel}` : "Subscribe"}
              />
            ) : null,
          ]),
        )}
      />
      <p className="mt-6 max-w-prose text-[13px] text-muted">
        Prices include VAT where applicable. Payments are handled by Stripe; Cardlens never sees your card details. The Annual Report is a one-off
        payment for 12 months of access and doesn&apos;t renew. Side-Business renews every year until you cancel, which you can do at any time from Manage billing.
      </p>
    </>
  );
}

function canBuy(current: PlanId, target: "personal" | "side_business"): boolean {
  if (current === "side_business") return false;
  if (current === "personal") return target === "side_business";
  return true;
}
