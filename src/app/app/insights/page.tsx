import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody, CardHeader, CardTitle, EmptyState, PageHeader, Table, Td, Th, buttonClasses } from "@/components/ui";
import { CategoryDonut, HBarList, SpendVsPaymentsChart } from "@/components/charts";
import { computeMetrics } from "@/lib/analytics";
import { getAllTransactions, getCustomCategoryNames, getStatementBalances, getYears } from "@/lib/data";
import { formatPence } from "@/lib/money";
import { requireUser } from "@/lib/session";
import { monthLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Insights" };

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { db } = await requireUser();
  const years = await getYears(db);
  if (!years.length) {
    return (
      <>
        <PageHeader title="Insights" />
        <EmptyState title="Nothing to analyse yet" body="Upload statements to see where your money goes." action={<Link href="/app/upload" className={buttonClasses("primary")}>Upload statements</Link>} />
      </>
    );
  }
  const { year: yParam } = await searchParams;
  const year = years.includes(Number(yParam)) ? Number(yParam) : years[0];
  const [txns, statements, names] = await Promise.all([getAllTransactions(db, { year }), getStatementBalances(db), getCustomCategoryNames(db)]);
  const m = computeMetrics(txns, statements, { year, customCategoryNames: names });

  return (
    <>
      <PageHeader
        title="Insights"
        description={`Where the money went in ${year}`}
        actions={
          <nav className="flex gap-1" aria-label="Year">
            {years.map((y) => (
              <Link key={y} href={`?year=${y}`} aria-current={y === year ? "page" : undefined} className={buttonClasses(y === year ? "primary" : "secondary", "sm")}>
                {y}
              </Link>
            ))}
          </nav>
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
            <p className="text-muted">None found for {year}.</p>
          )}
        </CardBody>
      </Card>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Business share</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="num font-display text-3xl font-semibold">{formatPence(m.business.spend_pence, { whole: true })}</p>
            <p className="mt-1 text-sm text-muted">{m.business.share_pct}% of spending is flagged as business. Tick the business box on any transaction to change this.</p>
          </CardBody>
        </Card>
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
