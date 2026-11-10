import type { Metrics } from "@/lib/analytics";
import { formatPence } from "@/lib/money";
import { monthLabel } from "@/lib/utils";
import type { AnnualSummary, SavingIdea } from "./schema";

const gbp = (p: number) => formatPence(p, { whole: true });
const pounds = (p: number) => Math.round(p / 100);

/** Saving ideas computed directly from metrics. Used as the template fallback and as hints for the AI. */
export function ruleBasedSavingIdeas(m: Metrics): SavingIdea[] {
  const ideas: SavingIdea[] = [];
  if (m.recurring.length > 0) {
    ideas.push({
      title: `Review ${m.recurring.length} recurring charge${m.recurring.length > 1 ? "s" : ""}`,
      detail: `Recurring charges cost about ${gbp(m.recurring_annual_total_pence)} a year. Cancelling any you no longer use saves the full amount for that service.`,
      estimated_annual_saving_gbp: pounds(m.recurring.length >= 2 ? m.recurring[0].annual_cost_pence + m.recurring[1].annual_cost_pence : m.recurring[0].annual_cost_pence),
    });
  }
  if (m.interest_and_fees_pence > 0) {
    ideas.push({
      title: "Avoid interest and fees",
      detail: `You paid ${gbp(m.interest_and_fees_pence)} in interest and fees. Paying the full balance by the due date each month avoids most of this.`,
      estimated_annual_saving_gbp: pounds(m.interest_and_fees_pence),
    });
  }
  const top = m.top_categories.find((c) => !["fees_interest", "cash", "uncategorised", "business"].includes(c.slug));
  if (top) {
    ideas.push({
      title: `Trim ${top.name.toLowerCase()} by a tenth`,
      detail: `${top.name} was your largest category at ${gbp(top.spend_pence)}. A 10% cut would save around ${gbp(Math.round(top.spend_pence / 10))} a year.`,
      estimated_annual_saving_gbp: pounds(Math.round(top.spend_pence / 10)),
    });
  }
  if (m.total_cash_advances_pence > 0) {
    ideas.push({
      title: "Stop using the card for cash",
      detail: `Cash advances totalled ${gbp(m.total_cash_advances_pence)}; they usually attract a fee and interest from day one.`,
      estimated_annual_saving_gbp: pounds(m.total_fees_pence > 0 ? Math.min(m.total_fees_pence, m.total_cash_advances_pence) : 0),
    });
  }
  return ideas.slice(0, 5);
}

/** Deterministic summary used when the AI summary fails validation twice. */
export function templateSummary(m: Metrics): AnnualSummary {
  const period = m.period_start && m.period_end ? `${monthLabel(m.period_start.slice(0, 7))} to ${monthLabel(m.period_end.slice(0, 7))}` : "the period";
  const top = m.top_categories.slice(0, 3);
  const topText = top.length ? top.map((c) => `${c.name.toLowerCase()} (${gbp(c.spend_pence)})`).join(", ") : "no single category";
  const netText =
    m.net_change_pence === null
      ? ""
      : m.net_change_pence > 0
        ? ` The amount owed on your cards rose by ${gbp(m.net_change_pence)} over the period.`
        : m.net_change_pence < 0
          ? ` The amount owed on your cards fell by ${gbp(Math.abs(m.net_change_pence))} over the period.`
          : " The amount owed on your cards was unchanged over the period.";
  const executive_summary =
    `This report covers ${m.transaction_count} transactions across ${m.card_count} card${m.card_count === 1 ? "" : "s"} from ${period}. ` +
    `Total spending, after refunds, was ${gbp(m.total_spend_pence)}, against payments of ${gbp(m.total_payments_pence)}. ` +
    `Interest and fees came to ${gbp(m.interest_and_fees_pence)}.${netText} ` +
    `In a typical month you spent around ${gbp(m.median_month_spend_pence)}. ` +
    `Your largest areas of spending were ${topText}. ` +
    (m.recurring.length
      ? `We found ${m.recurring.length} recurring charge${m.recurring.length === 1 ? "" : "s"} costing about ${gbp(m.recurring_annual_total_pence)} a year, which are worth reviewing. `
      : "") +
    (m.spikes.length ? `Spending was noticeably higher in ${m.spikes.map((s) => monthLabel(s.month)).join(", ")}. ` : "") +
    "The ideas below are budgeting suggestions based only on these figures; they are not financial advice.";

  const key_findings = [
    `Spending of ${gbp(m.total_spend_pence)} compared with payments of ${gbp(m.total_payments_pence)}.`,
    top[0] ? `${top[0].name} was the largest category at ${gbp(top[0].spend_pence)} (${top[0].share_pct}% of spending).` : "No dominant spending category.",
    m.interest_and_fees_pence > 0
      ? `Interest and fees cost ${gbp(m.interest_and_fees_pence)}.`
      : "No interest or fees were charged.",
  ];
  return { executive_summary, key_findings, saving_ideas: ruleBasedSavingIdeas(m) };
}
