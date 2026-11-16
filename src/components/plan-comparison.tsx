import { Check, Minus } from "lucide-react";
import {
  COMPARISON_PLANS,
  PLAN_COMPARISON,
  type ComparisonColumn,
  type ComparisonValue,
} from "@/lib/plans";
import { cn } from "@/lib/utils";

/**
 * What each plan includes, side by side. One table for the billing page and the landing page, built from
 * PLAN_COMPARISON in src/lib/plans.ts (tested against the real access rules).
 */
export function PlanComparison({
  current,
  actions,
  className,
}: {
  /** Highlights the plan the signed-in user is on. */
  current?: ComparisonColumn;
  /** Optional button or note under each plan's heading. */
  actions?: Partial<Record<ComparisonColumn, React.ReactNode>>;
  className?: string;
}) {
  return (
    <div className={className}>
      <PlanCards current={current} actions={actions} />
      <div className="hidden w-full overflow-x-auto rounded-[14px] border border-border bg-surface md:block">
        <table className="w-full min-w-[720px] border-collapse text-[15px]">
          <caption className="sr-only">
            What each Cardlens plan includes
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 w-[34%] bg-surface p-4 text-left align-bottom text-sm font-semibold text-muted"
              >
                What&apos;s included
              </th>
              {COMPARISON_PLANS.map((p) => (
                <th
                  key={p.id}
                  scope="col"
                  className={cn(
                    "border-l border-border p-4 text-left align-top font-normal",
                    p.id === "side_business" && "bg-brand-soft/50",
                    p.comingSoon && "text-muted",
                  )}
                >
                  <div className="flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-base font-semibold text-ink">
                        {p.name}
                      </span>
                      {current === p.id ? (
                        <span className="rounded-full bg-brand px-2 py-0.5 text-[12px] font-semibold text-white">
                          Your plan
                        </span>
                      ) : null}
                      {p.comingSoon ? (
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[12px] font-semibold text-muted">
                          Coming soon
                        </span>
                      ) : null}
                    </span>
                    <span className="flex items-baseline gap-1">
                      <span className="font-display text-2xl font-bold text-ink">
                        {p.price}
                      </span>
                      {p.unit ? (
                        <span className="text-[13px] text-muted">{p.unit}</span>
                      ) : null}
                    </span>
                    <span className="text-[13px] leading-snug text-muted">
                      {p.billing}
                    </span>
                    {actions?.[p.id] ? (
                      <div className="pt-2">{actions[p.id]}</div>
                    ) : null}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          {PLAN_COMPARISON.map((group) => (
            <tbody key={group.title}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={COMPARISON_PLANS.length + 1}
                  className="border-t border-border bg-surface-2 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted"
                >
                  {group.title}
                </th>
              </tr>
              {group.rows.map((row) => (
                <tr key={row.label}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-t border-border bg-surface px-4 py-3 text-left align-top font-normal"
                  >
                    <span className="block font-medium text-ink">
                      {row.label}
                    </span>
                    {row.hint ? (
                      <span className="block text-[13px] leading-snug text-muted">
                        {row.hint}
                      </span>
                    ) : null}
                  </th>
                  {COMPARISON_PLANS.map((p) => (
                    <td
                      key={p.id}
                      className={cn(
                        "border-l border-t border-border px-4 py-3 align-top",
                        p.id === "side_business" && "bg-brand-soft/30",
                      )}
                    >
                      <Cell value={row.values[p.id]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}

/** Small screens: one card per plan, listing what it includes and (muted) what it doesn't. */
function PlanCards({
  current,
  actions,
}: {
  current?: ComparisonColumn;
  actions?: Partial<Record<ComparisonColumn, React.ReactNode>>;
}) {
  return (
    <div className="flex flex-col gap-4 md:hidden">
      {COMPARISON_PLANS.map((p) => {
        const rows = PLAN_COMPARISON.flatMap((g) => g.rows);
        const included = rows.filter((r) => r.values[p.id] !== false);
        const missing = rows.filter((r) => r.values[p.id] === false);
        return (
          <section
            key={p.id}
            aria-label={`${p.name} plan`}
            className={cn(
              "flex flex-col gap-3 rounded-[14px] border bg-surface p-5",
              p.id === "side_business"
                ? "border-2 border-brand"
                : "border-border",
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-lg font-semibold">{p.name}</h3>
              {current === p.id ? (
                <span className="rounded-full bg-brand px-2 py-0.5 text-[12px] font-semibold text-white">
                  Your plan
                </span>
              ) : null}
              {p.comingSoon ? (
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[12px] font-semibold text-muted">
                  Coming soon
                </span>
              ) : null}
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-display text-3xl font-bold">{p.price}</span>
              {p.unit ? (
                <span className="text-sm text-muted">{p.unit}</span>
              ) : null}
            </div>
            <p className="text-sm text-muted">{p.billing}</p>
            {actions?.[p.id] ? <div>{actions[p.id]}</div> : null}
            <ul className="flex flex-col gap-2 text-[15px]">
              {included.map((r) => (
                <li key={r.label} className="flex gap-2">
                  <Check
                    size={18}
                    className="mt-0.5 flex-none text-brand"
                    aria-hidden="true"
                  />
                  <span>
                    {r.label}
                    {typeof r.values[p.id] === "string" ? (
                      <span className="text-muted">
                        : {String(r.values[p.id]).toLowerCase()}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
            {missing.length ? (
              <details className="text-sm text-muted">
                <summary className="cursor-pointer">
                  Not included ({missing.length})
                </summary>
                <ul className="mt-2 flex flex-col gap-1.5 pl-1">
                  {missing.map((r) => (
                    <li key={r.label} className="flex gap-2">
                      <Minus
                        size={16}
                        className="mt-0.5 flex-none"
                        aria-hidden="true"
                      />
                      {r.label}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function Cell({ value }: { value: ComparisonValue }) {
  if (value === true) {
    return (
      <>
        <Check size={20} className="text-brand" aria-hidden="true" />
        <span className="sr-only">Included</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <Minus size={20} className="text-muted/60" aria-hidden="true" />
        <span className="sr-only">Not included</span>
      </>
    );
  }
  return <span className="text-[14px] leading-snug text-ink">{value}</span>;
}
