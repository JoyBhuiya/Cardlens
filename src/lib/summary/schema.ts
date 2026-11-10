import { z } from "zod";

export const SavingIdea = z.object({
  title: z.string().describe("Short action, e.g. 'Review 4 subscriptions'"),
  detail: z.string().describe("One or two sentences explaining the idea using only figures from the metrics"),
  estimated_annual_saving_gbp: z.number().describe("Estimated annual saving in whole pounds, taken from or calculated from the metrics"),
});

export const AnnualSummary = z.object({
  executive_summary: z.string().describe("120–180 word professional summary of the year"),
  key_findings: z.array(z.string()).describe("Exactly 3 key findings, one sentence each"),
  saving_ideas: z.array(SavingIdea).describe("Up to 5 budgeting ideas"),
});

export type AnnualSummary = z.infer<typeof AnnualSummary>;
export type SavingIdea = z.infer<typeof SavingIdea>;
