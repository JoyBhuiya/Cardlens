"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { computeMetrics } from "@/lib/analytics";
import { getAllTransactions, getCustomCategoryNames, getStatementBalances } from "@/lib/data";
import { requireUser } from "@/lib/session";
import { generateSummary } from "@/lib/summary/generate";
import { aiMeter } from "@/lib/usage";

/** Compute metrics in TypeScript, then ask Claude for words around them (validated), and save the report. */
export async function generateReport(yearInput: number) {
  const year = z.number().int().min(2000).max(2100).parse(yearInput);
  const { db, user } = await requireUser();
  const [txns, statements, names] = await Promise.all([getAllTransactions(db, { year }), getStatementBalances(db), getCustomCategoryNames(db)]);
  if (!txns.length) return { error: `No transactions in ${year}.` };

  const metrics = computeMetrics(txns, statements, { year, customCategoryNames: names });
  const { summary, source, model } = await generateSummary(metrics, aiMeter(db, user.id, "summary"));
  try {
    await db.query(
      `insert into reports (user_id, year, metrics, summary, model, summary_source, created_at) values ($1, $2, $3, $4, $5, $6, now())
       on conflict (user_id, year) do update
         set metrics = excluded.metrics, summary = excluded.summary, model = excluded.model,
             summary_source = excluded.summary_source, created_at = excluded.created_at`,
      [user.id, year, JSON.stringify(metrics), JSON.stringify(summary), model, source],
    );
  } catch (err) {
    console.error("save report failed", err instanceof Error ? err.message : err);
    return { error: "Could not save the report." };
  }
  revalidatePath(`/app/report/${year}`);
  return { ok: true, source };
}
