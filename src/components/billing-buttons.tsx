"use client";

import { useState, useTransition } from "react";
import { openBillingPortal, startCheckout } from "@/app/app/billing/actions";
import { Button } from "@/components/ui";

function useRedirectAction(action: () => Promise<{ url?: string; error?: string }>) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = () =>
    start(async () => {
      setError(null);
      const res = await action();
      if (res.url) window.location.assign(res.url);
      else setError(res.error ?? "Something went wrong.");
    });
  return { pending, error, run };
}

export function CheckoutButton({ plan, label }: { plan: "personal" | "side_business"; label: string }) {
  const { pending, error, run } = useRedirectAction(() => startCheckout(plan));
  return (
    <div className="flex flex-col gap-2">
      <Button onClick={run} disabled={pending}>
        {pending ? "Opening checkout…" : label}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function PortalButton() {
  const { pending, error, run } = useRedirectAction(openBillingPortal);
  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" onClick={run} disabled={pending}>
        {pending ? "Opening…" : "Manage billing"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      ) : null}
    </div>
  );
}
