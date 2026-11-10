import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractStatementPdf } from "@/lib/ai/extract";
import { categoriseMerchants } from "@/lib/ai/categorise";
import type { MerchantRule } from "@/lib/types";
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

/** Runs extract → mask/normalise → reconcile → classify → categorise for one statement, as the signed-in user (RLS). */
export async function processStatement(supabase: SupabaseClient, userId: string, statementId: string): Promise<RunResult> {
  const { data: st, error: stErr } = await supabase
    .from("statements")
    .select("id, card_id, file_path, file_type, keep_file, status")
    .eq("id", statementId)
    .single();
  if (stErr || !st) return { status: "failed", transactionCount: 0, duplicatesDropped: 0, issues: [], error: "Statement not found." };
  if (!st.file_path) {
    return { status: "failed", transactionCount: 0, duplicatesDropped: 0, issues: [], error: "The original file is no longer stored. Upload it again to reprocess." };
  }

  const setStatus = (patch: Record<string, unknown>) => supabase.from("statements").update(patch).eq("id", statementId);

  try {
    await setStatus({ status: "extracting", error: null });

    const { data: file, error: dlErr } = await supabase.storage.from("statements").download(st.file_path);
    if (dlErr || !file) throw new Error("Could not read the uploaded file.");

    // ── Step 2: extract ──
    let header: StatementHeader;
    let lines: RawLine[];
    if (st.file_type === "pdf") {
      const { data } = await extractStatementPdf(await file.arrayBuffer());
      ({ header, lines } = fromExtraction(data));
    } else {
      const csv = parseStatementCsv(await file.text());
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
    if (lines.length === 0) throw new Error("No transactions were found in this file.");

    await setStatus({ status: "processing" });

    // ── Steps 3–6 ──
    const { data: rulesData } = await supabase.from("merchant_rules").select("pattern, merchant, category, is_business");
    const rules = (rulesData ?? []) as MerchantRule[];
    const result = transformStatement(st.card_id, header, lines, rules);
    let txns = result.transactions;
    if (result.unknownMerchants.length > 0) {
      txns = applyAiCategories(txns, await categoriseMerchants(result.unknownMerchants));
    }

    // Reprocessing replaces this statement's lines.
    await supabase.from("transactions").delete().eq("statement_id", statementId);

    const rows = txns.map((t) => ({
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
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const { data: ins, error: insErr } = await supabase
        .from("transactions")
        .upsert(rows.slice(i, i + 500), { onConflict: "user_id,dedupe_hash", ignoreDuplicates: true })
        .select("id");
      if (insErr) throw new Error(`Could not save transactions: ${insErr.message}`);
      inserted += ins?.length ?? 0;
    }
    const duplicatesDropped = rows.length - inserted;

    // Card last-4 from the statement, if the card has none yet.
    const last4 = safeLast4(header.card_last4);
    if (last4) await supabase.from("cards").update({ last4 }).eq("id", st.card_id).is("last4", null);

    await refreshRecurring(supabase);

    const rec = result.reconciliation;
    const status: RunResult["status"] = rec.reconciled === false ? "needs_review" : "parsed";
    const issues = [...rec.issues];
    if (duplicatesDropped > 0) issues.push(`${duplicatesDropped} line(s) already imported from an overlapping statement were skipped.`);

    const deleteFile = status === "parsed" && !st.keep_file;
    if (deleteFile) await supabase.storage.from("statements").remove([st.file_path]);

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
    const message = err instanceof Error ? err.message : "Processing failed.";
    await setStatus({ status: "failed", error: message });
    return { status: "failed", transactionCount: 0, duplicatesDropped: 0, issues: [], error: message };
  }
}

/** Re-flag recurring charges across all of the user's purchases. */
export async function refreshRecurring(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("transactions")
    .select("merchant, category, amount_pence, posted_on, kind")
    .eq("kind", "purchase")
    .limit(20000);
  const recurring = detectRecurring(data ?? []).map((r) => r.merchant);
  await supabase.from("transactions").update({ is_recurring: false }).eq("is_recurring", true);
  if (recurring.length) {
    for (let i = 0; i < recurring.length; i += 100) {
      await supabase.from("transactions").update({ is_recurring: true }).eq("kind", "purchase").in("merchant", recurring.slice(i, i + 100));
    }
  }
}
