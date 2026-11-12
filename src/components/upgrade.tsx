import Link from "next/link";
import { Lock } from "lucide-react";
import { buttonClasses, Card } from "@/components/ui";
import { PAID_PLANS, planFor, type Feature } from "@/lib/plans";
import { cn } from "@/lib/utils";

/** Shown in place of a paid feature. Names the cheapest plan that unlocks it and links to Plan & billing. */
export function UpgradeCard({ feature, title, body, className }: { feature: Feature; title: string; body: string; className?: string }) {
  const plan = PAID_PLANS.find((p) => p.id === planFor(feature))!;
  return (
    <Card className={cn("flex flex-col items-start gap-3 border-brand/40 bg-brand-soft/40 p-6", className)}>
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-brand-strong">
        <Lock size={16} aria-hidden="true" /> {plan.name} plan · {plan.priceLabel} {plan.unit}
      </span>
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <p className="max-w-prose text-[15px] text-muted">{body}</p>
      <Link href="/app/billing" className={buttonClasses("primary")}>
        See plans
      </Link>
    </Card>
  );
}

/** Small inline lock for a button or link that needs a plan. */
export function LockedLink({ feature, children }: { feature: Feature; children: React.ReactNode }) {
  const plan = PAID_PLANS.find((p) => p.id === planFor(feature))!;
  return (
    <Link href="/app/billing" className={buttonClasses("secondary")} title={`Needs the ${plan.name} plan`}>
      <Lock size={14} aria-hidden="true" /> {children}
    </Link>
  );
}
