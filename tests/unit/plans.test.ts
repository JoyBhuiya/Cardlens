import { describe, expect, it } from "vitest";
import { accessFor, currentPlan, planFor, type EntitlementRow } from "@/lib/plans";

const NOW = new Date("2026-11-13T12:00:00Z");
const row = (plan: EntitlementRow["plan"], status: EntitlementRow["status"], end: string | null): EntitlementRow => ({ plan, status, current_period_end: end });

describe("currentPlan", () => {
  it("is free with no purchases", () => {
    expect(currentPlan([], NOW)).toBe("free");
  });
  it("counts active and past-due purchases until their period ends", () => {
    expect(currentPlan([row("personal", "active", "2027-01-01T00:00:00Z")], NOW)).toBe("personal");
    expect(currentPlan([row("side_business", "past_due", "2026-12-01T00:00:00Z")], NOW)).toBe("side_business");
    expect(currentPlan([row("personal", "active", "2026-11-01T00:00:00Z")], NOW)).toBe("free");
  });
  it("ignores cancelled, expired (refunded) and finished purchases", () => {
    expect(currentPlan([row("side_business", "canceled", "2027-01-01T00:00:00Z")], NOW)).toBe("free");
    expect(currentPlan([row("personal", "expired", "2027-01-01T00:00:00Z")], NOW)).toBe("free");
  });
  it("takes the best plan when someone holds two", () => {
    expect(currentPlan([row("personal", "active", null), row("side_business", "active", "2027-06-01T00:00:00Z")], NOW)).toBe("side_business");
  });
});

describe("accessFor", () => {
  it("unlocks everything for everyone while payments are off (early access)", () => {
    const a = accessFor("free", false);
    expect(a.can("full_report") && a.can("csv_export") && a.can("business_split") && a.can("insights")).toBe(true);
    expect(a.maxCards).toBe(Number.POSITIVE_INFINITY);
  });
  it("free: no paid features, 1 card", () => {
    const a = accessFor("free", true);
    expect(["insights", "full_report", "pdf", "csv_export", "business_split"].some((f) => a.can(f as never))).toBe(false);
    expect(a.maxCards).toBe(1);
  });
  it("personal (£9): report, insights and PDF, but no CSV or business split, 1 card", () => {
    const a = accessFor("personal", true);
    expect([a.can("full_report"), a.can("insights"), a.can("pdf")]).toEqual([true, true, true]);
    expect([a.can("csv_export"), a.can("business_split")]).toEqual([false, false]);
    expect(a.maxCards).toBe(1);
  });
  it("side business (£29/yr): everything, 3 cards", () => {
    const a = accessFor("side_business", true);
    expect(a.can("csv_export") && a.can("business_split") && a.can("full_report")).toBe(true);
    expect(a.maxCards).toBe(3);
  });
});

describe("planFor", () => {
  it("names the cheapest plan that unlocks a feature", () => {
    expect(planFor("full_report")).toBe("personal");
    expect(planFor("insights")).toBe("personal");
    expect(planFor("csv_export")).toBe("side_business");
    expect(planFor("business_split")).toBe("side_business");
  });
});
