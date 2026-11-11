import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "./client";
import { LIMITS, serverEnv } from "@/lib/env";
import { MERCHANT_CATEGORY_SLUGS } from "@/lib/categories";
import { CATEGORISE_PROMPT } from "@/prompts/categorise";
import { LimitError, type AiMeter } from "@/lib/usage";

const Result = z.object({
  items: z.array(z.object({ merchant: z.string(), category: z.enum(MERCHANT_CATEGORY_SLUGS) })),
});

/**
 * Categorise unknown merchants with a Haiku-class model in batches of 50.
 * Only the cleaned merchant name and one sample description go to the model — never amounts or card data.
 */
export async function categoriseMerchants(
  unknown: { merchant: string; sample: string }[],
  meter: AiMeter,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < unknown.length; i += LIMITS.categoriseBatchSize) {
    const batch = unknown.slice(i, i + LIMITS.categoriseBatchSize);
    const model = serverEnv.categoriseModel();
    try {
      await meter.before();
    } catch (err) {
      if (err instanceof LimitError) break; // over the allowance: the rest stays uncategorised
      throw err;
    }
    let usage: { input_tokens: number; output_tokens: number } | null = null;
    try {
      const message = await anthropic().messages.parse({
        model,
        max_tokens: 4000,
        system: CATEGORISE_PROMPT,
        messages: [
          {
            role: "user",
            content: JSON.stringify(batch.map((b) => ({ merchant: b.merchant, sample: b.sample.slice(0, 80) }))),
          },
        ],
        output_config: { format: zodOutputFormat(Result) },
      });
      usage = message.usage;
      for (const item of message.parsed_output?.items ?? []) out.set(item.merchant, item.category);
    } catch (err) {
      // Categorising is best-effort: unknown merchants stay "uncategorised" and the user can fix them.
      console.error("categoriseMerchants batch failed", err instanceof Error ? err.message : err);
    } finally {
      await meter.after(model, usage);
    }
  }
  return out;
}
