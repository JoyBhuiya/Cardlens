import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody, CardHeader, CardTitle, EmptyState, PageHeader, Table, Td, Th, buttonClasses } from "@/components/ui";
import { CategoryDonut, HBarList, SpendVsPaymentsChart } from "@/components/charts";
import { PeriodPicker } from "@/components/period-picker";
import { UpgradeCard } from "@/components/upgrade";
import { computeMetrics } from "@/lib/analytics";
import { getAllTransactions, getCustomCategoryNames, getDataRange, getStatementBalances } from "@/lib/data";
import { getAccessCached } from "@/lib/entitlements";
import { availablePeriods, calendarYear, monthStarts, parsePeriodKey } from "@/lib/period";
import { formatPence } from "@/lib/money";
import { requireUser } from "@/lib/session";
import { monthLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Insights" };

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ period?: string; year?: string }> }) {
  const { db } = await requireUser();
  const [range, access] = await Promise.all([getDataRange(db), getAccessCached(db)]);
  if (!range.first || !range.last) {
    return (
      <>
        <PageHeader title="Insights" />
        <EmptyState title="Nothing to analyse yet" body="Upload statements to see where your money goes." action={<Link href="/app/upload" className={buttonClasses("primary")}>Upload statements</Link>} />
      </>
    );
  }
  if (!access.can("insights")) {
    return (
      <>
        <PageHeader title="Insights" />
        <UpgradeCard
          feature="insights"
          title="See where the money went"
          body="Spending by category, top merchants, month-by-month spikes, recurring charges and subscriptions with their yearly cost, and foreign-currency spend, for any year, tax year or 12 months."
        />
      </>
    );
  }
  const sp = await searchParams;
  // ?period= (2026, tax-2025, m-2025-11); older links used ?year=2026.
  const period = parsePeriodKey(sp.period ?? sp.year ?? "") ?? calendarYear(Number(range.last.slice(0, 4)));
  const periods = availablePeriods(range.first, range.last);
  const [txns, statements, names] = await Promise.all([getAllTransactions(db, { period }), getStatementBalances(db), getCustomCategoryNames(db)]);
  const m = computeMetrics(txns, statements, { period, customCategoryNames: names });

  return (
    <>
      <PageHeader
        title="Insights"
        description={`Where the money went: ${period.label}`}
        actions={
          <PeriodPicker
            base="/app/insights?period="
            current={period.key}
            calendar={periods.calendar.map((p) => ({ key: p.key, short: p.short }))}
            tax={periods.tax.map((p) => ({ key: p.key, short: p.short }))}
            months={monthStarts(range.first, range.last)}
          />
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Spending by category</CardTitle>
          </CardHeader>
          <CardBody>{m.top_categories.length ? <CategoryDonut data={m.top_categories} /> : <p className="text-muted">No spending.</p>}</CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top merchants</CardTitle>
          </CardHeader>
          <CardBody>
            <HBarList rows={m.top_merchants.map((x) => ({ label: x.merchant, value_pence: x.spend_pence, note: `${x.share_pct}%` }))} />
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Month by month</CardTitle>
          <p className="text-sm text-muted">
            Typical month {formatPence(m.median_month_spend_pence, { whole: true })}.
            {m.spikes.length ? ` Spikes (over 1.5× a typical month): ${m.spikes.map((s) => `${monthLabel(s.month)} (${s.ratio_to_median}×)`).join(", ")}.` : " No unusual spikes."}
          </p>
        </CardHeader>
        <CardBody>
          <SpendVsPaymentsChart data={m.monthly} showInterest={m.interest_and_fees_pence > 0} />
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recurring charges</CardTitle>
          <p className="text-sm text-muted">Same merchant and a similar amount in 3 or more months.</p>
        </CardHeader>
        <CardBody>
          {m.recurring.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Merchant</Th>
                  <Th className="text-right">Typical amount</Th>
                  <Th className="text-right">Months seen</Th>
                  <Th className="text-right">Annual cost</Th>
                </tr>
              </thead>
              <tbody>
                {m.recurring.map((r) => (
                  <tr key={r.merchant}>
                    <Td className="font-medium">{r.merchant}</Td>
                    <Td className="num text-right">{formatPence(r.typical_pence)}</Td>
                    <Td className="num text-right">{r.months_seen}</Td>
                    <Td className="num text-right font-semibold">{formatPence(r.annual_cost_pence)}</Td>
                  </tr>
                ))}
                <tr>
                  <Td className="font-semibold">Total</Td>
                  <Td />
                  <Td />
                  <Td className="num text-right font-bold">{formatPence(m.recurring_annual_total_pence)}</Td>
                </tr>
              </tbody>
            </Table>
          ) : (
            <p className="text-muted">None found for {period.label}.</p>
          )}
        </CardBody>
      </Card>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {access.can("business_split") ? (
        <Card>
          <CardHeader>
            <CardTitle>Business share</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="num font-display text-3xl font-semibold">{formatPence(m.business.spend_pence, { whole: true })}</p>
            <p className="mt-1 text-sm text-muted">{m.business.share_pct}% of spending is flagged as business. Tick the business box on any transaction to change this.</p>
          </CardBody>
        </Card>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Foreign currency</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="num font-display text-3xl font-semibold">{formatPence(m.foreign.spend_pence, { whole: true })}</p>
            <p className="mt-1 text-sm text-muted">{m.foreign.count} non-sterling purchases. These often carry a foreign transaction fee.</p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
