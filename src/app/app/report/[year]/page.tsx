import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardBody, EmptyState, PageHeader, Table, Td, Th, buttonClasses } from "@/components/ui";
import { CategoryDonut, HBarList, SpendVsPaymentsChart } from "@/components/charts";
import { GenerateReportButton, PrintButton } from "@/components/report-buttons";
import type { Metrics } from "@/lib/analytics";
import { getYears } from "@/lib/data";
import { formatPence } from "@/lib/money";
import type { AnnualSummary } from "@/lib/summary/schema";
import { requireUser } from "@/lib/session";
import { formatDate } from "@/lib/utils";

export const maxDuration = 180; // report generation (server action) calls Claude

export async function generateMetadata({ params }: { params: Promise<{ year: string }> }): Promise<Metadata> {
  const { year } = await params;
  return { title: `Annual report ${year}` };
}

export default async function ReportPage({ params }: { params: Promise<{ year: string }> }) {
  const { year: yearStr } = await params;
  const year = Number(yearStr);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) notFound();
  const { db } = await requireUser();
  const [years, report, latestTxn] = await Promise.all([
    getYears(db),
    db.one<{ metrics: unknown; summary: unknown; model: string | null; summary_source: "ai" | "template"; created_at: string }>(
      "select metrics, summary, model, summary_source, created_at from reports where year = $1",
      [year],
    ),
    db.one<{ created_at: string }>("select max(created_at) as created_at from transactions"),
  ]);

  const yearNav = (
    <nav className="flex gap-1" aria-label="Year">
      {years.map((y) => (
        <Link key={y} href={`/app/report/${y}`} aria-current={y === year ? "page" : undefined} className={buttonClasses(y === year ? "primary" : "secondary", "sm")}>
          {y}
        </Link>
      ))}
    </nav>
  );

  if (!report) {
    return (
      <>
        <PageHeader title={`Annual report ${year}`} actions={yearNav} />
        {years.includes(year) ? (
          <Card className="flex flex-col items-start gap-3 p-8">
            <h2 className="font-display text-xl font-semibold">Ready to build your {year} report</h2>
            <p className="max-w-prose text-[15px] text-muted">
              We&apos;ll total every head, rank your categories and merchants, and write a short professional summary with costed saving ideas. Every
              figure comes from your reconciled transactions.
            </p>
            <GenerateReportButton year={year} />
          </Card>
        ) : (
          <EmptyState title={`No transactions in ${year}`} body="Upload statements for this year first." action={<Link href="/app/upload" className={buttonClasses("primary")}>Upload statements</Link>} />
        )}
      </>
    );
  }

  const m = report.metrics as Metrics;
  const s = report.summary as AnnualSummary;
  const stale = !!latestTxn?.created_at && latestTxn.created_at > report.created_at;

  return (
    <article>
      <PageHeader
        title={`Your card year ${year}`}
        description={`${formatDate(m.period_start)} to ${formatDate(m.period_end)} · ${m.transaction_count} transactions · ${m.card_count} card${m.card_count === 1 ? "" : "s"}`}
        actions={
          <>
            {yearNav}
            <PrintButton />
            <a href={`/api/export/transactions?year=${year}`} className={buttonClasses("secondary")}>
              CSV
            </a>
          </>
        }
      />
      {stale ? (
        <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-warning/30 bg-warning/10 px-4 py-3 text-[15px]">
          <span>New transactions were added since this report was built.</span>
          <GenerateReportButton year={year} label="Rebuild report" />
        </div>
      ) : null}

      <section className="avoid-break grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Headline figures">
        <Headline label="Total spend" value={formatPence(m.total_spend_pence, { whole: true })} />
        <Headline label="Payments made" value={formatPence(m.total_payments_pence, { whole: true })} />
        <Headline label="Interest and fees" value={formatPence(m.interest_and_fees_pence)} negative={m.interest_and_fees_pence > 0} />
        <Headline
          label="Change in balance"
          value={m.net_change_pence === null ? "—" : `${m.net_change_pence > 0 ? "+" : m.net_change_pence < 0 ? "−" : ""}${formatPence(Math.abs(m.net_change_pence), { whole: true })}`}
        />
      </section>

      <Card className="avoid-break mt-6">
        <CardBody className="flex flex-col gap-4">
          <h2 className="font-display text-xl font-semibold">Executive summary</h2>
          <p className="max-w-prose text-[16px] leading-relaxed">{s.executive_summary}</p>
          <h3 className="mt-2 font-display text-base font-semibold">Key findings</h3>
          <ol className="list-decimal pl-5 text-[15px] leading-relaxed">
            {s.key_findings.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ol>
        </CardBody>
      </Card>

      <Card className="avoid-break mt-6">
        <CardBody>
          <h2 className="mb-3 font-display text-xl font-semibold">Spend vs payments by head</h2>
          <Table>
            <thead>
              <tr>
                <Th>Head</Th>
                <Th className="text-right">Lines</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {m.heads.map((h) => (
                <tr key={h.kind}>
                  <Td>{h.label}</Td>
                  <Td className="num text-right">{h.count}</Td>
                  <Td className={`num text-right font-semibold ${h.kind === "payment" || h.kind === "refund" ? "text-positive" : h.kind === "interest" || h.kind === "fee" ? "text-negative" : ""}`}>
                    {formatPence(h.total_pence)}
                  </Td>
                </tr>
              ))}
              <tr>
                <Td className="font-semibold">Total spend (purchases + cash − refunds)</Td>
                <Td />
                <Td className="num text-right font-bold">{formatPence(m.total_spend_pence)}</Td>
              </tr>
            </tbody>
          </Table>
        </CardBody>
      </Card>

      <Card className="avoid-break mt-6">
        <CardBody>
          <h2 className="mb-3 font-display text-xl font-semibold">Month by month</h2>
          <SpendVsPaymentsChart data={m.monthly} showInterest={m.interest_and_fees_pence > 0} />
        </CardBody>
      </Card>

      <div className="print-break mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="avoid-break">
          <CardBody>
            <h2 className="mb-3 font-display text-xl font-semibold">Where it went</h2>
            <CategoryDonut data={m.top_categories} />
          </CardBody>
        </Card>
        <Card className="avoid-break">
          <CardBody>
            <h2 className="mb-3 font-display text-xl font-semibold">Top merchants</h2>
            <HBarList rows={m.top_merchants.map((x) => ({ label: x.merchant, value_pence: x.spend_pence, note: `${x.share_pct}%` }))} />
          </CardBody>
        </Card>
      </div>

      <Card className="avoid-break mt-6">
        <CardBody>
          <h2 className="mb-4 font-display text-xl font-semibold">Saving ideas</h2>
          {s.saving_ideas.length ? (
            <ul className="grid gap-4 md:grid-cols-2">
              {s.saving_ideas.map((idea, i) => (
                <li key={i} className="flex flex-col gap-1.5 rounded-[10px] border border-border p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-semibold">{idea.title}</h3>
                    {idea.estimated_annual_saving_gbp > 0 ? (
                      <span className="num whitespace-nowrap font-display font-semibold text-brand">
                        {formatPence(idea.estimated_annual_saving_gbp * 100, { whole: true })}/yr
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm leading-relaxed text-muted">{idea.detail}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">No obvious savings — nicely managed.</p>
          )}
          <p className="mt-4 text-xs text-muted">
            Budgeting guidance based only on your statement data. Not financial advice. {report.summary_source === "template" ? "Summary generated from a standard template." : "Summary written with AI from the figures above and checked against them."}
          </p>
        </CardBody>
      </Card>
    </article>
  );
}

function Headline({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-4">
      <span className="text-xs text-muted">{label}</span>
      <span className={`num font-display text-2xl font-semibold ${negative ? "text-negative" : ""}`}>{value}</span>
    </div>
  );
}
