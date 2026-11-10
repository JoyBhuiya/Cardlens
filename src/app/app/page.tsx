import Link from "next/link";
import { Card, CardBody, CardHeader, CardTitle, EmptyState, PageHeader, Stat, buttonClasses } from "@/components/ui";
import { SpendVsPaymentsChart } from "@/components/charts";
import { computeMetrics } from "@/lib/analytics";
import { getAllTransactions, getCustomCategoryNames, getStatementBalances } from "@/lib/data";
import { formatPence } from "@/lib/money";
import { requireUser } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export default async function OverviewPage() {
  const { supabase } = await requireUser();
  const [txns, statements, names, { count: reviewCount }] = await Promise.all([
    getAllTransactions(supabase),
    getStatementBalances(supabase),
    getCustomCategoryNames(supabase),
    supabase.from("statements").select("id", { count: "exact", head: true }).in("status", ["needs_review", "failed"]),
  ]);

  if (txns.length === 0) {
    return (
      <>
        <PageHeader title="Overview" />
        <EmptyState
          title="Upload your first statements"
          body="Add up to 12 months of PDF or CSV credit card statements. We'll check every line against the statement balances, sort purchases from payments and fees, and build your annual report."
          action={
            <Link href="/app/upload" className={buttonClasses("primary", "lg")}>
              Upload statements
            </Link>
          }
        />
      </>
    );
  }

  // Last 12 months of data, ending at the latest transaction.
  const last = txns[txns.length - 1].posted_on;
  const start = new Date(`${last.slice(0, 7)}-01T00:00:00Z`);
  start.setUTCMonth(start.getUTCMonth() - 11);
  const fromIso = start.toISOString().slice(0, 10);
  const window = txns.filter((t) => t.posted_on >= fromIso);
  const m = computeMetrics(
    window,
    statements.filter((s) => (s.period_end ?? "") >= fromIso),
    { customCategoryNames: names },
  );
  const latestYear = Number(last.slice(0, 4));

  return (
    <>
      <PageHeader
        title="Overview"
        description={`${formatDate(m.period_start)} to ${formatDate(m.period_end)} · ${m.transaction_count} transactions across ${m.card_count} card${m.card_count === 1 ? "" : "s"}`}
        actions={
          <>
            <Link href="/app/upload" className={buttonClasses("secondary")}>
              Upload more
            </Link>
            <Link href={`/app/report/${latestYear}`} className={buttonClasses("primary")}>
              {latestYear} report
            </Link>
          </>
        }
      />
      {reviewCount ? (
        <div className="mb-6 rounded-[10px] border border-warning/30 bg-warning/10 px-4 py-3 text-[15px]" role="status">
          {reviewCount} statement{reviewCount === 1 ? " needs" : "s need"} attention.{" "}
          <Link href="/app/statements" className="font-semibold">
            Review statements
          </Link>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total spend" value={formatPence(m.total_spend_pence, { whole: true })} />
        <Stat label="Payments made" value={formatPence(m.total_payments_pence, { whole: true })} />
        <Stat label="Interest and fees" value={formatPence(m.interest_and_fees_pence)} tone={m.interest_and_fees_pence > 0 ? "negative" : undefined} />
        <Stat
          label="Change in balance"
          value={m.net_change_pence === null ? "—" : `${m.net_change_pence > 0 ? "+" : m.net_change_pence < 0 ? "−" : ""}${formatPence(Math.abs(m.net_change_pence), { whole: true })}`}
          tone={m.net_change_pence !== null && m.net_change_pence > 0 ? "negative" : m.net_change_pence !== null && m.net_change_pence < 0 ? "positive" : undefined}
        />
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Spend vs payments, by month</CardTitle>
        </CardHeader>
        <CardBody>
          <SpendVsPaymentsChart data={m.monthly} />
        </CardBody>
      </Card>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top categories</CardTitle>
          </CardHeader>
          <CardBody>
            <ol className="flex flex-col gap-2 text-[15px]">
              {m.top_categories.slice(0, 5).map((c) => (
                <li key={c.slug} className="flex justify-between gap-3">
                  <span>{c.name}</span>
                  <span className="num font-semibold">{formatPence(c.spend_pence, { whole: true })}</span>
                </li>
              ))}
            </ol>
            <Link href="/app/insights" className="mt-4 inline-block text-sm font-semibold">
              All insights
            </Link>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recurring charges</CardTitle>
          </CardHeader>
          <CardBody>
            {m.recurring.length ? (
              <>
                <p className="text-[15px] text-muted">
                  {m.recurring.length} found, about <strong className="num text-ink">{formatPence(m.recurring_annual_total_pence, { whole: true })}</strong> a year.
                </p>
                <ul className="mt-3 flex flex-col gap-2 text-[15px]">
                  {m.recurring.slice(0, 4).map((r) => (
                    <li key={r.merchant} className="flex justify-between gap-3">
                      <span>{r.merchant}</span>
                      <span className="num text-muted">{formatPence(r.typical_pence)} / month</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-[15px] text-muted">No recurring charges found yet. Upload at least 3 months to detect them.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
