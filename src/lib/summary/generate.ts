import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "@/lib/ai/client";
import type { Metrics } from "@/lib/analytics";
import { serverEnv } from "@/lib/env";
import { ANNUAL_SUMMARY_PROMPT } from "@/prompts/annual-summary";
import { AnnualSummary } from "./schema";
import { ruleBasedSavingIdeas, templateSummary } from "./template";
import { validateSummary } from "./validate";

export interface GeneratedSummary {
  summary: AnnualSummary;
  source: "ai" | "template";
  model: string | null;
}

/** Only the metrics object is sent — no raw descriptions, no card details. */
function metricsForModel(m: Metrics) {
  return {
    ...m,
    top_merchants: m.top_merchants.slice(0, 8),
    top_categories: m.top_categories.slice(0, 10),
    recurring: m.recurring.slice(0, 15),
  };
}

/** Ask Claude; validate every £ figure; retry once with feedback; then fall back to the template. */
export async function generateSummary(metrics: Metrics): Promise<GeneratedSummary> {
  const model = serverEnv.summaryModel();
  const payload = JSON.stringify({ metrics: metricsForModel(metrics), hints: ruleBasedSavingIdeas(metrics) });
  let feedback = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const msg = await anthropic().messages.parse({
        model,
        max_tokens: 2500,
        system: ANNUAL_SUMMARY_PROMPT,
        messages: [{ role: "user", content: payload + (feedback ? `\n\nYour previous answer was rejected: ${feedback} Fix this.` : "") }],
        output_config: { format: zodOutputFormat(AnnualSummary) },
      });
      const parsed = msg.parsed_output ? AnnualSummary.parse(msg.parsed_output) : null;
      if (!parsed) {
        feedback = "The output did not match the schema.";
        continue;
      }
      const v = validateSummary(parsed, metrics);
      if (v.ok) return { summary: parsed, source: "ai", model };
      feedback = v.problems.join(" ");
    } catch (err) {
      console.error("generateSummary attempt failed", err instanceof Error ? err.message : err);
      break;
    }
  }
  return { summary: templateSummary(metrics), source: "template", model: null };
}
