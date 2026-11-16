"use server";

import { revalidatePath } from "next/cache";
import { computeMetrics } from "@/lib/analytics";
import { getAllTransactions, getCustomCategoryNames, getStatementBalances } from "@/lib/data";
import { getAccess } from "@/lib/entitlements";
import { parsePeriodKey } from "@/lib/period";
import { requireUser } from "@/lib/session";
import { generateSummary } from "@/lib/summary/generate";
import { aiMeter } from "@/lib/usage";

/** Compute metrics in TypeScript, then ask Claude for words around them (validated), and save the report. */
export async function generateReport(periodKey: string) {
  const period = parsePeriodKey(String(periodKey));
  if (!period) return { error: "Unknown report period." };
  const { db, user } = await requireUser();
  // The full report (and its Claude call) is a paid feature; the free preview needs no stored report.
  if (!(await getAccess(db)).can("full_report")) return { error: "The full report needs a paid plan. See Plan & billing." };

  const [txns, statements, names] = await Promise.all([getAllTransactions(db, { period }), getStatementBalances(db), getCustomCategoryNames(db)]);
  if (!txns.length) return { error: `No transactions in ${period.label}.` };

  const metrics = computeMetrics(txns, statements, { period, customCategoryNames: names });
  const { summary, source, model } = await generateSummary(metrics, aiMeter(db, user.id, "summary"));
  try {
    await db.query(
      `insert into reports (user_id, year, period_key, metrics, summary, model, summary_source, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, now())
       on conflict (user_id, period_key) do update
         set metrics = excluded.metrics, summary = excluded.summary, model = excluded.model,
             summary_source = excluded.summary_source, created_at = excluded.created_at`,
      [user.id, period.startYear, period.key, JSON.stringify(metrics), JSON.stringify(summary), model, source],
    );
  } catch (err) {
    console.error("save report failed", err instanceof Error ? err.message : err);
    return { error: "Could not save the report." };
  }
  revalidatePath(`/app/report/${period.key}`);
  return { ok: true, source };
}
