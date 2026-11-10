import type { Metrics } from "@/lib/analytics";
import type { AnnualSummary } from "./schema";

/** Collect every pence value in the metrics object (fields ending in _pence, at any depth). */
export function metricPenceValues(metrics: Metrics): number[] {
  const out: number[] = [];
  const walk = (v: unknown, key = "") => {
    if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
    else if (typeof v === "number" && key.endsWith("_pence")) out.push(Math.abs(v));
  };
  walk(metrics);
  return [...new Set(out)];
}

/**
 * Every £ figure the model may use: a metric value, or one that follows arithmetically —
 * ×12, ÷12, a sum or difference of two metric values, or a sum of recurring annual costs.
 * Returned in pence.
 */
export function allowedAmounts(metrics: Metrics): number[] {
  const base = metricPenceValues(metrics);
  const allowed = new Set<number>(base);
  for (const v of base) {
    allowed.add(v * 12);
    allowed.add(Math.round(v / 12));
    allowed.add(Math.round(v / 2));
    allowed.add(Math.round(v / 10)); // "a 10% cut"
  }
  // Pairwise sums/differences of headline totals only (top-level fields), so the
  // allowed set stays sparse and invented numbers don't slip through by coincidence.
  const headline = Object.entries(metrics)
    .filter(([k, v]) => k.endsWith("_pence") && typeof v === "number")
    .map(([, v]) => Math.abs(v as number));
  headline.push(metrics.business.spend_pence, metrics.foreign.spend_pence);
  for (let i = 0; i < headline.length; i++) {
    for (let j = i + 1; j < headline.length; j++) {
      allowed.add(headline[i] + headline[j]);
      allowed.add(Math.abs(headline[i] - headline[j]));
    }
  }
  // Cumulative sums of recurring charges (e.g. "cancelling the top 3 saves £…").
  let run = 0;
  for (const r of metrics.recurring) {
    run += r.annual_cost_pence;
    allowed.add(run);
  }
  return [...allowed];
}

/** Find £ figures in text: "£1,234", "£1,234.56", "£12k". Returns pence. */
export function poundFigures(text: string): number[] {
  return poundFiguresDetailed(text).map((f) => f.pence);
}

function poundFiguresDetailed(text: string): { pence: number; abbreviated: boolean }[] {
  const out: { pence: number; abbreviated: boolean }[] = [];
  const re = /£\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?\s?(k|K)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const whole = Number(m[1].replace(/,/g, ""));
    const frac = m[2] ? Number((m[2].slice(1) + "00").slice(0, 2)) : 0;
    let pence = whole * 100 + frac;
    if (m[3]) pence *= 1000;
    out.push({ pence, abbreviated: Boolean(m[3]) });
  }
  return out;
}

/** A figure passes if it is within £1 (rounding to whole pounds) of an allowed amount; "£12k" style gets 5%. */
function isGrounded(pence: number, allowed: number[], abbreviated = false): boolean {
  const tol = abbreviated ? Math.round(pence * 0.05) : 100;
  return allowed.some((a) => Math.abs(a - pence) <= tol);
}

export interface ValidationResult {
  ok: boolean;
  ungrounded: number[];
  problems: string[];
}

export function validateSummary(summary: AnnualSummary, metrics: Metrics): ValidationResult {
  const allowed = allowedAmounts(metrics);
  const problems: string[] = [];
  const ungrounded: number[] = [];

  const texts = [
    summary.executive_summary,
    ...summary.key_findings,
    ...summary.saving_ideas.flatMap((s) => [s.title, s.detail]),
  ];
  for (const t of texts) {
    for (const f of poundFiguresDetailed(t)) {
      if (!isGrounded(f.pence, allowed, f.abbreviated)) ungrounded.push(f.pence);
    }
  }
  for (const s of summary.saving_ideas) {
    const p = Math.round(s.estimated_annual_saving_gbp * 100);
    if (p < 0 || !isGrounded(p, allowed)) ungrounded.push(p);
  }
  if (ungrounded.length) problems.push(`Figures not found in the metrics: ${ungrounded.map((p) => `£${(p / 100).toFixed(2)}`).join(", ")}`);

  const words = summary.executive_summary.trim().split(/\s+/).length;
  if (words < 90 || words > 220) problems.push(`Executive summary is ${words} words (expected 120–180).`);
  if (summary.key_findings.length !== 3) problems.push(`Expected 3 key findings, got ${summary.key_findings.length}.`);
  if (summary.saving_ideas.length > 5) problems.push("More than 5 saving ideas.");

  // Budgeting guidance only — never name financial products.
  const banned = /\b(balance transfer card|0% card|zero per ?cent card|switch (to|your) (a )?(card|provider|bank)|apply for|loan|ISA|invest(ing|ment)? in|crypto|pension)\b/i;
  for (const t of texts) if (banned.test(t)) problems.push(`Contains product advice: "${t.slice(0, 80)}…"`);

  return { ok: problems.length === 0, ungrounded, problems };
}
