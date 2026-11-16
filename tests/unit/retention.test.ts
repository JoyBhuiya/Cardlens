import { describe, expect, it } from "vitest";
import { retentionWarningEmail } from "@/lib/email/retention-warning";
import { addMonths, retentionAction, retentionConfig, retentionSchedule, type RetentionConfig } from "@/lib/retention-policy";

const cfg: RetentionConfig = { inactiveMonths: 13, warningDays: 30, leftoverFileDays: 7, keptFileDays: 90 };
const DAY = 86_400_000;
const last = new Date("2025-01-10T12:00:00Z");
const due = addMonths(last, 13); // 2026-02-10

describe("retentionAction", () => {
  it("keeps recently active accounts", () => {
    expect(retentionAction({ lastActiveAt: last, warnedAt: null, hasLivePlan: false }, new Date("2025-06-01"), cfg).kind).toBe("keep");
  });

  it("warns 30 days before the 13-month mark, with the deletion date", () => {
    const now = new Date(due.getTime() - 30 * DAY);
    const a = retentionAction({ lastActiveAt: last, warnedAt: null, hasLivePlan: false }, now, cfg);
    expect(a).toEqual({ kind: "warn", deleteOn: due });
  });

  it("never deletes without a warning at least warningDays old, even if the sweep was late", () => {
    const now = new Date(due.getTime() + 100 * DAY);
    const a = retentionAction({ lastActiveAt: last, warnedAt: null, hasLivePlan: false }, now, cfg);
    expect(a.kind).toBe("warn");
    if (a.kind === "warn") expect(a.deleteOn.getTime()).toBe(now.getTime() + 30 * DAY);
    const tooSoon = retentionAction({ lastActiveAt: last, warnedAt: new Date(now.getTime() - 5 * DAY), hasLivePlan: false }, now, cfg);
    expect(tooSoon.kind).toBe("keep");
  });

  it("deletes once warned long enough and past the mark", () => {
    const warnedAt = new Date(due.getTime() - 30 * DAY);
    expect(retentionAction({ lastActiveAt: last, warnedAt, hasLivePlan: false }, due, cfg).kind).toBe("delete");
  });

  it("a sign-in after the warning starts the clock again", () => {
    const warnedAt = new Date(due.getTime() - 30 * DAY);
    const signedIn = new Date(due.getTime() - 10 * DAY);
    expect(retentionAction({ lastActiveAt: signedIn, warnedAt, hasLivePlan: false }, due, cfg).kind).toBe("keep");
  });

  it("never touches paying customers, and can be switched off", () => {
    const now = new Date(due.getTime() + 60 * DAY);
    const warnedAt = new Date(due.getTime() - 30 * DAY);
    expect(retentionAction({ lastActiveAt: last, warnedAt, hasLivePlan: true }, now, cfg).kind).toBe("keep");
    expect(retentionAction({ lastActiveAt: last, warnedAt, hasLivePlan: false }, now, { ...cfg, inactiveMonths: 0 }).kind).toBe("keep");
  });
});

describe("retention config and schedule", () => {
  it("has safe defaults and reads env", () => {
    expect(retentionConfig({} as unknown as NodeJS.ProcessEnv)).toEqual(cfg);
    expect(retentionConfig({ RETENTION_INACTIVE_MONTHS: "24", RETENTION_WARNING_DAYS: "0" } as unknown as NodeJS.ProcessEnv)).toMatchObject({ inactiveMonths: 24, warningDays: 1 });
  });
  it("the privacy schedule states the configured numbers", () => {
    const text = retentionSchedule(cfg).map((r) => r.kept).join(" ");
    expect(text).toContain("13 months");
    expect(text).toContain("30 days");
    expect(text).toContain("7 days");
  });
});

describe("retention warning email", () => {
  it("names the date and how to keep the data", () => {
    const mail = retentionWarningEmail({ deleteOn: due, signInUrl: "https://cardlens.example/login", siteHost: "cardlens.example", inactiveMonths: 13 });
    expect(mail.subject).toBe("Your Cardlens data will be deleted on 10 February 2026");
    expect(mail.text).toContain("https://cardlens.example/login");
    expect(mail.html).toContain("Sign in to keep my data");
  });
});
