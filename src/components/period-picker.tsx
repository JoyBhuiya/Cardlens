"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonClasses } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface PeriodOption {
  key: string;
  short: string;
}

/**
 * Choose the period for the report or Insights: a calendar year, a UK tax year, or any 12 months.
 * `base` is "/app/report/" (key appended to the path) or "/app/insights?period=" (key as a query value).
 */
export function PeriodPicker({
  base,
  current,
  calendar,
  tax,
  months,
}: {
  base: string;
  current: string;
  calendar: PeriodOption[];
  tax: PeriodOption[];
  months: { value: string; label: string }[];
}) {
  const router = useRouter();
  const href = (key: string) => `${base}${encodeURIComponent(key)}`;
  const monthKey = current.startsWith("m-") ? current : "";
  const group = (label: string, opts: PeriodOption[]) =>
    opts.length ? (
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label={label}>
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
        {opts.map((o) => (
          <Link
            key={o.key}
            href={href(o.key)}
            aria-current={o.key === current ? "page" : undefined}
            className={buttonClasses(o.key === current ? "primary" : "secondary", "sm")}
          >
            {o.short}
          </Link>
        ))}
      </div>
    ) : null;

  return (
    <nav aria-label="Period" className="no-print flex flex-col gap-2 sm:items-end">
      {group("Year", calendar)}
      {group("Tax year", tax)}
      {months.length ? (
        <label className="flex items-center gap-2 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">12 months from</span>
          <select
            className={cn("min-h-9 rounded-[8px] border border-border bg-surface px-2 text-sm", monthKey && "border-brand")}
            value={monthKey}
            onChange={(e) => e.target.value && router.push(href(e.target.value))}
          >
            <option value="">Choose a month…</option>
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </nav>
  );
}
