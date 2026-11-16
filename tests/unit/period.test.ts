import { describe, expect, it } from "vitest";
import { availablePeriods, calendarYear, inPeriod, monthStarts, overlaps, parsePeriodKey, taxYear, taxYearOf, twelveMonths } from "@/lib/period";

describe("periods", () => {
  it("parses calendar, tax-year and 12-month keys", () => {
    expect(parsePeriodKey("2026")).toMatchObject({ kind: "calendar", start: "2026-01-01", end: "2026-12-31", label: "2026" });
    expect(parsePeriodKey("tax-2025")).toMatchObject({ kind: "tax", start: "2025-04-06", end: "2026-04-05", label: "2025/26 tax year", short: "2025/26" });
    expect(parsePeriodKey("m-2025-11")).toMatchObject({ kind: "months", start: "2025-11-01", end: "2026-10-31", label: "Nov 2025 – Oct 2026" });
    expect(parsePeriodKey("m-2026-01")).toMatchObject({ start: "2026-01-01", end: "2026-12-31" });
    expect(parsePeriodKey("m-2025-03")).toMatchObject({ start: "2025-03-01", end: "2026-02-28" });
    expect(parsePeriodKey("m-2027-03")).toMatchObject({ end: "2028-02-29" }); // leap year
  });
  it("rejects anything else", () => {
    for (const k of ["", "26", "1999", "tax-26", "m-2025-13", "m-2025-00", "2026; drop table", "../x"]) expect(parsePeriodKey(k)).toBeNull();
  });
  it("puts 5 and 6 April on the right sides of the tax year", () => {
    expect(taxYearOf("2026-04-05")).toBe(2025);
    expect(taxYearOf("2026-04-06")).toBe(2026);
    expect(inPeriod("2026-04-05", taxYear(2025))).toBe(true);
    expect(inPeriod("2026-04-06", taxYear(2025))).toBe(false);
    expect(taxYear(2099).short).toBe("2099/00");
  });
  it("lists the calendar and tax years that have data, newest first", () => {
    const p = availablePeriods("2025-03-02", "2026-10-13");
    expect(p.calendar.map((x) => x.key)).toEqual(["2026", "2025"]);
    expect(p.tax.map((x) => x.key)).toEqual(["tax-2026", "tax-2025", "tax-2024"]);
    expect(availablePeriods(null, null)).toEqual({ calendar: [], tax: [] });
  });
  it("offers each month in the data as a 12-month start", () => {
    expect(monthStarts("2025-11-20", "2026-02-02").map((m) => m.value)).toEqual(["m-2026-02", "m-2026-01", "m-2025-12", "m-2025-11"]);
  });
  it("knows whether a period overlaps the data", () => {
    expect(overlaps(calendarYear(2026), "2025-03-01", "2026-01-10")).toBe(true);
    expect(overlaps(calendarYear(2027), "2025-03-01", "2026-01-10")).toBe(false);
    expect(overlaps(twelveMonths(2024, 6), "2025-03-01", "2026-01-10")).toBe(true);
  });
});
