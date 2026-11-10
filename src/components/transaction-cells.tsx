"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateTransaction } from "@/app/app/transactions/actions";
import { Button } from "@/components/ui";

/** Inline category edit that offers "apply to all from this merchant". */
export function CategoryCell({ id, merchant, value, options }: { id: string; merchant: string; value: string; options: { slug: string; name: string }[] }) {
  const router = useRouter();
  const [current, setCurrent] = useState(value);
  const [pendingChoice, setPendingChoice] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  const save = (category: string, applyToMerchant: boolean) =>
    start(async () => {
      await updateTransaction({ id, category, applyToMerchant });
      setCurrent(category);
      setPendingChoice(null);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-1.5">
      <select
        aria-label={`Category for ${merchant}`}
        className="min-h-9 max-w-44 rounded-[8px] border border-border bg-surface px-2 text-sm"
        value={pendingChoice ?? current}
        disabled={isPending}
        onChange={(e) => setPendingChoice(e.target.value === current ? null : e.target.value)}
      >
        {options.map((o) => (
          <option key={o.slug} value={o.slug}>
            {o.name}
          </option>
        ))}
      </select>
      {pendingChoice ? (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Apply change">
          <Button size="sm" disabled={isPending} onClick={() => save(pendingChoice, true)}>
            All from {merchant.length > 14 ? `${merchant.slice(0, 14)}…` : merchant}
          </Button>
          <Button size="sm" variant="secondary" disabled={isPending} onClick={() => save(pendingChoice, false)}>
            Just this one
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function BusinessCell({ id, merchant, value }: { id: string; merchant: string; value: boolean }) {
  const router = useRouter();
  const [checked, setChecked] = useState(value);
  const [isPending, start] = useTransition();
  return (
    <label className="inline-flex min-h-9 items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="size-5 accent-[var(--brand)]"
        checked={checked}
        disabled={isPending}
        aria-label={`Mark ${merchant} as business`}
        onChange={(e) => {
          const v = e.target.checked;
          setChecked(v);
          start(async () => {
            await updateTransaction({ id, is_business: v, applyToMerchant: false });
            router.refresh();
          });
        }}
      />
      <span className="sr-only sm:not-sr-only">{checked ? "Business" : "Personal"}</span>
    </label>
  );
}
