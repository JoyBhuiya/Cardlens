import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th, buttonClasses } from "@/components/ui";
import { AutoRefresh } from "@/components/auto-refresh";
import { StatementActions } from "@/components/statement-actions";
import { cardLabel, getCards } from "@/lib/data";
import { formatPence } from "@/lib/money";
import type { StatementStatus } from "@/lib/types";
import { requireUser } from "@/lib/session";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Statements" };

const STATUS: Record<StatementStatus, { label: string; tone: "positive" | "warning" | "negative" | "neutral" | "brand" }> = {
  parsed: { label: "Reconciled", tone: "positive" },
  needs_review: { label: "Needs review", tone: "warning" },
  failed: { label: "Failed", tone: "negative" },
  uploaded: { label: "Waiting", tone: "neutral" },
  extracting: { label: "Reading", tone: "brand" },
  processing: { label: "Processing", tone: "brand" },
};

const IN_PROGRESS = new Set(["uploaded", "extracting", "processing"]);

/** Queued or being read right now (the background worker has it). */
function isActive(s: { status: string; job_status: string | null }): boolean {
  return IN_PROGRESS.has(s.status) && (s.job_status === "queued" || s.job_status === "running");
}

/**
 * In progress but nothing is working on it: no live job (e.g. uploaded before background processing existed,
 * or the job gave up) and untouched for 5+ minutes. Offer a retry.
 */
function isInterrupted(s: { status: string; updated_at: string; job_status: string | null }): boolean {
  return IN_PROGRESS.has(s.status) && !isActive(s) && Date.now() - new Date(s.updated_at).getTime() > 5 * 60 * 1000;
}

interface StatementListRow {
  id: string;
  card_id: string;
  file_name: string | null;
  file_type: "pdf" | "csv";
  file_path: string | null;
  status: StatementStatus;
  issuer: string | null;
  period_start: string | null;
  period_end: string | null;
  opening_balance_pence: number | null;
  closing_balance_pence: number | null;
  total_debits_pence: number | null;
  total_credits_pence: number | null;
  reconciled: boolean | null;
  reconciliation_diff_pence: number | null;
  transaction_count: number;
  duplicates_dropped: number;
  error: string | null;
  created_at: string;
  updated_at: string;
  job_status: "queued" | "running" | "done" | "failed" | null;
}

export default async function StatementsPage() {
  const { db } = await requireUser();
  const [cards, statements] = await Promise.all([
    getCards(db),
    db.query<StatementListRow>(
      `select s.id, s.card_id, s.file_name, s.file_type, s.file_path, s.status, s.issuer, s.period_start, s.period_end,
              s.opening_balance_pence, s.closing_balance_pence, s.total_debits_pence, s.total_credits_pence, s.reconciled,
              s.reconciliation_diff_pence, s.transaction_count, s.duplicates_dropped, s.error, s.created_at, s.updated_at,
              j.status as job_status
       from statements s left join statement_jobs j on j.statement_id = s.id
       order by s.period_end desc nulls first, s.created_at desc`,
    ),
  ]);
  const cardMap = new Map(cards.map((c) => [c.id, cardLabel(c)]));
  const anyActive = statements.some(isActive);

  if (!statements.length) {
    return (
      <>
        <PageHeader title="Statements" />
        <EmptyState
          title="No statements yet"
          body="Upload PDF or CSV statements to see each period, its totals and whether it reconciles to the bank's balances."
          action={<Link href="/app/upload" className={buttonClasses("primary")}>Upload statements</Link>}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Statements"
        description="Each statement is checked: opening balance + charges − credits must equal the closing balance."
        actions={<Link href="/app/upload" className={buttonClasses("primary")}>Upload</Link>}
      />
      <AutoRefresh active={anyActive} />
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Period</Th>
              <Th>Card</Th>
              <Th className="text-right">Charges</Th>
              <Th className="text-right">Credits</Th>
              <Th className="text-right">Closing</Th>
              <Th>Check</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {statements.map((s) => {
              const stale = isInterrupted(s);
              const st = stale ? { label: "Interrupted — retry", tone: "warning" as const } : STATUS[s.status as StatementStatus];
              return (
                <tr key={s.id} className="align-top">
                  <Td>
                    <div className="font-medium">{s.period_start ? `${formatDate(s.period_start)} – ${formatDate(s.period_end)}` : s.file_name}</div>
                    <div className="text-xs text-muted">
                      {s.file_type.toUpperCase()} · {s.transaction_count} lines
                      {s.duplicates_dropped ? ` · ${s.duplicates_dropped} duplicates skipped` : ""}
                    </div>
                  </Td>
                  <Td>{cardMap.get(s.card_id) ?? s.issuer ?? "—"}</Td>
                  <Td className="num text-right">{formatPence(s.total_debits_pence)}</Td>
                  <Td className="num text-right text-positive">{formatPence(s.total_credits_pence)}</Td>
                  <Td className="num text-right">{formatPence(s.closing_balance_pence)}</Td>
                  <Td>
                    <div className="flex flex-col gap-1.5">
                      <Badge tone={st.tone}>{s.status === "parsed" && s.reconciled === null ? "Imported (no balances)" : st.label}</Badge>
                      {s.error && s.status !== "parsed" ? (
                        <details className="max-w-xs text-xs text-muted">
                          <summary className="cursor-pointer font-semibold text-ink">Why?</summary>
                          <ul className="mt-1 list-disc pl-4">
                            {s.error.split("\n").map((e: string, i: number) => (
                              <li key={i}>{e}</li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </div>
                  </Td>
                  <Td>
                    <StatementActions id={s.id} canRetry={Boolean(s.file_path) && s.status !== "parsed" && !isActive(s)} />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
