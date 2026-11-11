import "server-only";
import { extractStatementPdf } from "@/lib/ai/extract";
import { categoriseMerchants } from "@/lib/ai/categorise";
import type { Db, UserDb } from "@/lib/db";
import { UserError } from "@/lib/errors";
import { readStoredFile, removeFile } from "@/lib/storage";
import type { MerchantRule } from "@/lib/types";
import { aiMeter } from "@/lib/usage";
import { parseStatementCsv } from "./csv";
import { safeLast4 } from "./normalise";
import { detectRecurring } from "./recurring";
import { applyAiCategories, fromExtraction, transformStatement, type RawLine, type StatementHeader } from "./transform";

export interface RunResult {
  status: "parsed" | "needs_review" | "failed";
  transactionCount: number;
  duplicatesDropped: number;
  issues: string[];
  error?: string;
}

const TXN_COLUMNS = [
  "user_id",
  "statement_id",
  "card_id",
  "posted_on",
  "description_raw",
  "merchant",
  "amount_pence",
  "direction",
  "kind",
  "category",
  "category_source",
  "is_business",
  "is_recurring",
  "foreign_currency",
  "dedupe_hash",
] as const;
type TxnInsert = Record<(typeof TXN_COLUMNS)[number], unknown>;

/** Inserts rows, skipping lines already imported from an overlapping statement. Returns how many were new. */
async function insertTransactions(db: Db, rows: TxnInsert[]): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const params: unknown[] = [];
    const values = rows.slice(i, i + 500).map((r) => `(${TXN_COLUMNS.map((c) => `$${params.push(r[c])}`).join(", ")})`);
    const res = await db.query(
      `insert into transactions (${TXN_COLUMNS.join(", ")}) values ${values.join(", ")}
       on conflict (user_id, dedupe_hash) do nothing returning id`,
      params,
    );
    inserted += res.length;
  }
  return inserted;
}

const fail = (error: string): RunResult => ({ status: "failed", transactionCount: 0, duplicatesDropped: 0, issues: [], error });

/** Runs extract → mask/normalise → reconcile → classify → categorise for one statement, as the signed-in user (RLS). */
export async function processStatement(db: UserDb, userId: string, statementId: string): Promise<RunResult> {
  // Claim the statement atomically. Only new, failed or needs-review statements, or ones stuck for 5+ minutes,
  // run: a parsed statement or one already in flight is refused, because every run can cost a Claude request.
  const st = await db.one<{ card_id: string; file_path: string; file_type: "pdf" | "csv"; keep_file: boolean }>(
    `update statements set status = 'extracting', error = null
     where id = $1 and file_path is not null
       and (status in ('uploaded', 'failed', 'needs_review')
            or (status in ('extracting', 'processing') and updated_at < now() - interval '5 minutes'))
     returning card_id, file_path, file_type, keep_file`,
    [statementId],
  );
  if (!st) {
    const row = await db.one<{ status: string; file_path: string | null }>("select status, file_path from statements where id = $1", [statementId]);
    if (!row) return fail("Statement not found.");
    if (!row.file_path) return fail("The original file is no longer stored. Upload it again to reprocess.");
    return fail(row.status === "parsed" ? "This statement is already processed." : "This statement is already being processed.");
  }

  const setStatus = (patch: Record<string, unknown>) => {
    const keys = Object.keys(patch); // fixed column names from this file only, never user input
    return db.query(`update statements set ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")} where id = $1`, [
      statementId,
      ...keys.map((k) => patch[k]),
    ]);
  };

  try {
    const file = await readStoredFile(userId, st.file_path).catch(() => {
      throw new UserError("Could not read the uploaded file.");
    });

    // ── Step 2: extract ──
    let header: StatementHeader;
    let lines: RawLine[];
    if (st.file_type === "pdf") {
      const { data } = await extractStatementPdf(file, aiMeter(db, userId, "extract"));
      ({ header, lines } = fromExtraction(data));
    } else {
      const csv = parseStatementCsv(file.toString("utf8"));
      header = {
        issuer: null,
        card_last4: null,
        period_start: csv.period_start,
        period_end: csv.period_end,
        opening_balance_pence: null,
        closing_balance_pence: null,
        printed_total_debits_pence: null,
        printed_total_credits_pence: null,
      };
      lines = csv.transactions.map((t) => ({ date: t.posted_on, description: t.description_raw, amount_pence: t.amount_pence, direction: t.direction }));
    }
    if (lines.length === 0) throw new UserError("No transactions were found in this file.");

    await setStatus({ status: "processing" });

    // ── Steps 3–6 ──
    const rules = await db.query<MerchantRule>("select pattern, merchant, category, is_business from merchant_rules");
    const result = transformStatement(st.card_id, header, lines, rules);
    let txns = result.transactions;
    if (result.unknownMerchants.length > 0) {
      txns = applyAiCategories(txns, await categoriseMerchants(result.unknownMerchants, aiMeter(db, userId, "categorise")));
    }

    const rows: TxnInsert[] = txns.map((t) => ({
      user_id: userId,
      statement_id: statementId,
      card_id: st.card_id,
      posted_on: t.posted_on,
      description_raw: t.description_raw,
      merchant: t.merchant,
      amount_pence: t.amount_pence,
      direction: t.direction,
      kind: t.kind,
      category: t.category,
      category_source: t.category_source,
      is_business: t.is_business,
      is_recurring: false,
      foreign_currency: t.foreign_currency,
      dedupe_hash: t.dedupe_hash,
    }));
    // Reprocessing replaces this statement's lines, all or nothing.
    const inserted = await db.tx(async (tx) => {
      await tx.query("delete from transactions where statement_id = $1", [statementId]);
      return insertTransactions(tx, rows);
    });
    const duplicatesDropped = rows.length - inserted;

    // Card last-4 from the statement, if the card has none yet.
    const last4 = safeLast4(header.card_last4);
    if (last4) await db.query("update cards set last4 = $2 where id = $1 and last4 is null", [st.card_id, last4]);

    await refreshRecurring(db);

    const rec = result.reconciliation;
    const status: RunResult["status"] = rec.reconciled === false ? "needs_review" : "parsed";
    const issues = [...rec.issues];
    if (duplicatesDropped > 0) issues.push(`${duplicatesDropped} line(s) already imported from an overlapping statement were skipped.`);

    const deleteFile = status === "parsed" && !st.keep_file;
    if (deleteFile) await removeFile(userId, st.file_path);

    await setStatus({
      status,
      issuer: header.issuer,
      period_start: header.period_start,
      period_end: header.period_end,
      opening_balance_pence: header.opening_balance_pence,
      closing_balance_pence: header.closing_balance_pence,
      total_debits_pence: rec.total_debits_pence,
      total_credits_pence: rec.total_credits_pence,
      reconciled: rec.reconciled,
      reconciliation_diff_pence: rec.diff_pence,
      transaction_count: inserted,
      duplicates_dropped: duplicatesDropped,
      error: issues.length ? issues.join("\n") : null,
      ...(deleteFile ? { file_path: null } : {}),
    });
    return { status, transactionCount: inserted, duplicatesDropped, issues };
  } catch (err) {
    // Show only messages written for users; log the rest and show a generic one.
    const message = err instanceof UserError ? err.message : "Processing failed. Please try again.";
    if (!(err instanceof UserError)) console.error("processStatement failed", err instanceof Error ? err.message : err);
    await setStatus({ status: "failed", error: message });
    return fail(message);
  }
}

/** Re-flag recurring charges across all of the user's purchases. */
export async function refreshRecurring(db: UserDb) {
  const data = await db.query<{ merchant: string; category: string; amount_pence: number; posted_on: string; kind: "purchase" }>(
    "select merchant, category, amount_pence, posted_on, kind from transactions where kind = 'purchase' limit 20000",
  );
  const recurring = detectRecurring(data).map((r) => r.merchant);
  await db.tx(async (tx) => {
    await tx.query("update transactions set is_recurring = false where is_recurring");
    if (recurring.length) await tx.query("update transactions set is_recurring = true where kind = 'purchase' and merchant = any($1)", [recurring]);
  });
}
