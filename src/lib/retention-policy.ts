/**
 * Retention rules (UK GDPR storage limitation). Pure: no database, so it is unit-tested directly.
 * src/lib/retention.ts applies them on a schedule; /privacy shows the same numbers from RETENTION.
 */

const int = (v: string | undefined, fallback: number) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export interface RetentionConfig {
  /** Delete an account this many months after the last sign-in. 0 switches it off. */
  inactiveMonths: number;
  /** Email a warning this many days before deleting. */
  warningDays: number;
  /** Statement files not read successfully (failed, needs review, never processed) are deleted after this. */
  leftoverFileDays: number;
  /** Statement files the user chose to keep are deleted after this. */
  keptFileDays: number;
}

export function retentionConfig(env: NodeJS.ProcessEnv = process.env): RetentionConfig {
  return {
    inactiveMonths: int(env.RETENTION_INACTIVE_MONTHS, 13),
    warningDays: Math.max(1, int(env.RETENTION_WARNING_DAYS, 30)),
    leftoverFileDays: Math.max(1, int(env.RETENTION_LEFTOVER_FILE_DAYS, 7)),
    keptFileDays: Math.max(1, int(env.RETENTION_KEPT_FILE_DAYS, 90)),
  };
}

export interface AccountState {
  lastActiveAt: Date;
  /** When the deletion warning was emailed; cleared when the user signs in again. */
  warnedAt: Date | null;
  /** Holds a paid plan that hasn't ended (we never delete a paying customer's account on our own). */
  hasLivePlan: boolean;
}

export type RetentionAction = { kind: "keep" } | { kind: "warn"; deleteOn: Date } | { kind: "delete" };

export function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + months);
  return r;
}

const DAY = 86_400_000;

/**
 * Keep, warn or delete one account. An account is warned once it has been inactive for `inactiveMonths` minus
 * `warningDays`, and deleted only after a warning that is at least `warningDays` old, so nobody loses data
 * without notice (even if the sweep didn't run for a while).
 */
export function retentionAction(a: AccountState, now: Date, cfg: RetentionConfig): RetentionAction {
  if (cfg.inactiveMonths === 0 || a.hasLivePlan) return { kind: "keep" };
  const dueOn = addMonths(a.lastActiveAt, cfg.inactiveMonths);
  const warnFrom = new Date(dueOn.getTime() - cfg.warningDays * DAY);
  if (now < warnFrom) return { kind: "keep" };
  if (!a.warnedAt || a.warnedAt < a.lastActiveAt) {
    return { kind: "warn", deleteOn: new Date(Math.max(dueOn.getTime(), now.getTime() + cfg.warningDays * DAY)) };
  }
  const warnedLongEnough = now.getTime() - a.warnedAt.getTime() >= cfg.warningDays * DAY;
  return warnedLongEnough && now >= dueOn ? { kind: "delete" } : { kind: "keep" };
}

/** Plain-words retention schedule for the privacy page. */
export function retentionSchedule(cfg: RetentionConfig = retentionConfig()): { what: string; kept: string }[] {
  return [
    { what: "Statement files you upload", kept: `Deleted as soon as they are read successfully. Files that couldn't be read are deleted after ${cfg.leftoverFileDays} days; files you chose to keep, after ${cfg.keptFileDays} days.` },
    {
      what: "Your account, transactions, rules and reports",
      kept:
        cfg.inactiveMonths > 0
          ? `Until you delete them, or ${cfg.inactiveMonths} months after your last sign-in. We email you ${cfg.warningDays} days before, and signing in keeps everything. Accounts with a paid plan that hasn't ended are never deleted this way.`
          : "Until you delete them.",
    },
    { what: "Sign-in codes", kept: "Stored hashed, valid for 15 minutes, removed within a day." },
    { what: "Sessions", kept: "Until you sign out or they expire; we don't store your IP address or browser details with them." },
    { what: "Payment records", kept: "Held in our Stripe account for as long as tax and accounting law requires (usually 6 years), even after you delete your Cardlens account." },
    { what: "Usage counts (uploads, AI requests)", kept: "Deleted with your account." },
    { what: "Server logs", kept: "Overwritten as they grow (a few days to weeks); they never contain statement content, email addresses or codes." },
  ];
}
