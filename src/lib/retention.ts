import "server-only";
import { anonDb, userDb, type Db } from "@/lib/db";
import { retentionWarningEmail } from "@/lib/email/retention-warning";
import { serverEnv } from "@/lib/env";
import { sendMail } from "@/lib/mail";
import { retentionAction, retentionConfig, type RetentionConfig } from "@/lib/retention-policy";
import { removeFile, removeUserFiles } from "@/lib/storage";

/**
 * Storage limitation, applied on a schedule by the worker (src/lib/worker.ts):
 *  - accounts inactive for RETENTION_INACTIVE_MONTHS are warned by email, then deleted;
 *  - statement files that weren't read, or that the user kept, are deleted after a few days / weeks;
 *  - expired sign-in codes, expired sessions and old rate-limit windows are removed.
 * Every step is idempotent, so a missed or repeated run is harmless.
 */

const BATCH = 500;

/** Called on every signed-in request; writes at most once a day per user. Signing in cancels a pending deletion. */
export async function touchUser(db: Db, userId: string): Promise<void> {
  await db.query(
    `update "user" set last_active_at = now(), retention_warned_at = null
     where id = $1 and (last_active_at is null or last_active_at < now() - interval '1 day' or retention_warned_at is not null)`,
    [userId],
  );
}

interface Candidate {
  id: string;
  email: string;
  last_active_at: Date | string;
  retention_warned_at: Date | string | null;
}

export interface SweepResult {
  warned: number;
  deleted: number;
  filesRemoved: number;
  housekeeping: number;
}

export async function sweepAccounts(now: Date = new Date(), cfg: RetentionConfig = retentionConfig()): Promise<{ warned: number; deleted: number }> {
  if (cfg.inactiveMonths === 0) return { warned: 0, deleted: 0 };
  // Only accounts within the warning window can need action. Paid plans are checked here and in the policy.
  const candidates = await anonDb.query<Candidate>(
    `select u.id, u.email, u.last_active_at, u.retention_warned_at
     from "user" u
     where u.last_active_at < $1::timestamptz - make_interval(months => $2) + make_interval(days => $3)
     order by u.last_active_at
     limit ${BATCH}`,
    [now.toISOString(), cfg.inactiveMonths, cfg.warningDays],
  );
  let warned = 0;
  let deleted = 0;
  for (const c of candidates) {
    // entitlements is behind RLS: check paid plans in the user's own scope.
    const live = await userDb(c.id).query(
      `select 1 from entitlements where status in ('active', 'past_due') and (current_period_end is null or current_period_end > now()) limit 1`,
    );
    const action = retentionAction(
      {
        lastActiveAt: new Date(c.last_active_at),
        warnedAt: c.retention_warned_at ? new Date(c.retention_warned_at) : null,
        hasLivePlan: live.length > 0,
      },
      now,
      cfg,
    );
    try {
      if (action.kind === "warn") {
        // Claim first so two runs can't both email; only the run that set the flag sends.
        const claimed = await anonDb.query<{ id: string }>(
          `update "user" set retention_warned_at = $2 where id = $1
             and last_active_at < $2::timestamptz - make_interval(months => $3) + make_interval(days => $4)
             and (retention_warned_at is null or retention_warned_at < last_active_at) returning id`,
          [c.id, now.toISOString(), cfg.inactiveMonths, cfg.warningDays],
        );
        if (claimed.length === 0) continue;
        const mail = retentionWarningEmail({
          deleteOn: action.deleteOn,
          signInUrl: `${serverEnv.siteUrl()}/login`,
          siteHost: new URL(serverEnv.siteUrl()).host,
          inactiveMonths: cfg.inactiveMonths,
        });
        try {
          await sendMail({ to: c.email, ...mail });
          warned++;
        } catch (err) {
          // Undo the claim so the next run tries again: never delete without a delivered warning attempt.
          await anonDb.query(`update "user" set retention_warned_at = null where id = $1`, [c.id]);
          throw err;
        }
      } else if (action.kind === "delete") {
        // The delete re-checks every condition, so a sign-in a moment ago wins. Files go only if the row went.
        const gone = await anonDb.query<{ id: string }>(
          `delete from "user" where id = $1
             and last_active_at < $2::timestamptz - make_interval(months => $3)
             and retention_warned_at is not null and retention_warned_at >= last_active_at
             and retention_warned_at <= $2::timestamptz - make_interval(days => $4) returning id`,
          [c.id, now.toISOString(), cfg.inactiveMonths, cfg.warningDays],
        );
        if (gone.length) {
          await removeUserFiles(c.id);
          deleted++;
        }
      }
    } catch (err) {
      console.error("[retention] account step failed", c.id, err instanceof Error ? err.message : err);
    }
  }
  return { warned, deleted };
}

/** Deletes statement files that were never read successfully, or that the user kept, once they are old enough. */
export async function sweepFiles(cfg: RetentionConfig = retentionConfig()): Promise<number> {
  // statements is behind RLS, so go user by user (only users who still have a file on disk).
  const users = await anonDb.query<{ id: string }>(`select id from "user" order by id`);
  let removed = 0;
  for (const u of users) {
    const db = userDb(u.id);
    const files = await db.query<{ id: string; file_path: string }>(
      `select s.id, s.file_path from statements s
       where s.file_path is not null
         and not exists (select 1 from statement_jobs j where j.statement_id = s.id and j.status in ('queued', 'running'))
         and s.status not in ('extracting', 'processing')
         and ((s.keep_file and s.status = 'parsed' and s.updated_at < now() - make_interval(days => $1))
           or (s.status <> 'parsed' and s.updated_at < now() - make_interval(days => $2)))`,
      [cfg.keptFileDays, cfg.leftoverFileDays],
    );
    for (const f of files) {
      try {
        await removeFile(u.id, f.file_path);
        await db.query(`update statements set file_path = null where id = $1`, [f.id]);
        removed++;
      } catch (err) {
        console.error("[retention] file removal failed", f.id, err instanceof Error ? err.message : err);
      }
    }
  }
  return removed;
}

/** Expired sign-in codes and sessions, and rate-limit windows nobody will read again. */
export async function housekeeping(): Promise<number> {
  const a = await anonDb.query(`delete from verification where "expiresAt" < now() - interval '1 day' returning 1`);
  const b = await anonDb.query(`delete from "session" where "expiresAt" < now() - interval '1 day' returning 1`);
  const c = await anonDb.query(`delete from rate_limits where window_start < now() - interval '2 days' returning 1`);
  return a.length + b.length + c.length;
}

export async function runRetention(now: Date = new Date()): Promise<SweepResult> {
  const cfg = retentionConfig();
  const accounts = await sweepAccounts(now, cfg);
  const filesRemoved = await sweepFiles(cfg);
  const swept = await housekeeping();
  return { ...accounts, filesRemoved, housekeeping: swept };
}
