"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { computeMetrics } from "@/lib/analytics";
import { getAllTransactions, getCustomCategoryNames, getStatementBalances } from "@/lib/data";
import { generateSummary } from "@/lib/summary/generate";
import { requireUser } from "@/lib/supabase/server";

/** Compute metrics in TypeScript, then ask Claude for words around them (validated), and save the report. */
export async function generateReport(yearInput: number) {
  const year = z.number().int().min(2000).max(2100).parse(yearInput);
  const { supabase, user } = await requireUser();
  const [txns, statements, names] = await Promise.all([getAllTransactions(supabase, { year }), getStatementBalances(supabase), getCustomCategoryNames(supabase)]);
  if (!txns.length) return { error: `No transactions in ${year}.` };

  const metrics = computeMetrics(txns, statements, { year, customCategoryNames: names });
  const { summary, source, model } = await generateSummary(metrics);
  const { error } = await supabase
    .from("reports")
    .upsert({ user_id: user.id, year, metrics, summary, model, summary_source: source, created_at: new Date().toISOString() }, { onConflict: "user_id,year" });
  if (error) return { error: "Could not save the report." };
  revalidatePath(`/app/report/${year}`);
  return { ok: true, source };
}
