import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th, buttonClasses } from "@/components/ui";
import { StatementActions } from "@/components/statement-actions";
import { cardLabel, getCards } from "@/lib/data";
import { formatPence } from "@/lib/money";
import type { StatementStatus } from "@/lib/types";
import { requireUser } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Statements" };

const STATUS: Record<StatementStatus, { label: string; tone: "positive" | "warning" | "negative" | "neutral" | "brand" }> = {
  parsed: { label: "Reconciled", tone: "positive" },
  needs_review: { label: "Needs review", tone: "warning" },
  failed: { label: "Failed", tone: "negative" },
  uploaded: { label: "Uploaded", tone: "neutral" },
  extracting: { label: "Reading", tone: "brand" },
  processing: { label: "Processing", tone: "brand" },
};

export default async function StatementsPage() {
  const { supabase } = await requireUser();
  const [cards, { data }] = await Promise.all([
    getCards(supabase),
    supabase
      .from("statements")
      .select("id, card_id, file_name, file_type, file_path, status, issuer, period_start, period_end, opening_balance_pence, closing_balance_pence, total_debits_pence, total_credits_pence, reconciled, reconciliation_diff_pence, transaction_count, duplicates_dropped, error, created_at")
      .order("period_end", { ascending: false, nullsFirst: true })
      .order("created_at", { ascending: false }),
  ]);
  const statements = data ?? [];
  const cardMap = new Map(cards.map((c) => [c.id, cardLabel(c)]));

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
              const st = STATUS[s.status as StatementStatus];
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
                    <StatementActions id={s.id} canRetry={Boolean(s.file_path) && s.status !== "parsed"} />
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
