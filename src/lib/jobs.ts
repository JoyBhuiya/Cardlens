import "server-only";
import type { Db } from "@/lib/db";

/**
 * Background processing queue (table statement_jobs, migration 0003). Uploads enqueue a job; the in-process
 * worker (src/lib/worker.ts) claims jobs and runs the pipeline. The statements row stays the source of truth
 * for what the user sees; the job row only says whether work is waiting.
 */

type WakeFn = () => void;
const globalForQueue = globalThis as unknown as { cardlensWake?: Set<WakeFn> };
const waiters = (globalForQueue.cardlensWake ??= new Set());

/** Lets an idle worker loop start right away instead of waiting for its next poll. */
export function onWake(fn: WakeFn): () => void {
  waiters.add(fn);
  return () => waiters.delete(fn);
}

function wake() {
  for (const fn of waiters) fn();
}

/**
 * Queue a statement (new upload or retry). `db` is the user's userDb: the select proves the statement is
 * theirs (RLS) before anything is queued. Returns false if it isn't theirs or has no stored file.
 */
export async function enqueueStatement(db: Db, userId: string, statementId: string): Promise<boolean> {
  const own = await db.one("select 1 from statements where id = $1 and file_path is not null", [statementId]);
  if (!own) return false;
  await db.query(
    `insert into statement_jobs (statement_id, user_id) values ($1, $2)
     on conflict (statement_id) do update
       set status = 'queued', attempts = 0, run_after = now(), locked_at = null`,
    [statementId, userId],
  );
  wake();
  return true;
}

export interface ClaimedJob {
  statement_id: string;
  user_id: string;
  attempts: number;
}

/** A running job not finished after this long is treated as abandoned (e.g. the server restarted). */
export const STALE_JOB_MINUTES = 10;
export const MAX_JOB_ATTEMPTS = 3;

/** Atomically take the oldest ready job. SKIP LOCKED lets several worker loops run without clashing. */
export async function claimJob(db: Db): Promise<ClaimedJob | null> {
  return db.one<ClaimedJob>(
    `with next as (
       select statement_id from statement_jobs
       where (status = 'queued' and run_after <= now())
          or (status = 'running' and locked_at < now() - make_interval(mins => $1))
       order by run_after, created_at
       for update skip locked
       limit 1
     )
     update statement_jobs j
        set status = 'running', locked_at = now(), attempts = j.attempts + 1
       from next
      where j.statement_id = next.statement_id
     returning j.statement_id, j.user_id, j.attempts`,
    [STALE_JOB_MINUTES],
  );
}

export async function finishJob(db: Db, statementId: string, status: "done" | "failed"): Promise<void> {
  await db.query("update statement_jobs set status = $2, locked_at = null where statement_id = $1", [statementId, status]);
}

/** Put a job back after an unexpected error, waiting longer each time. */
export async function retryJobLater(db: Db, statementId: string, attempts: number): Promise<void> {
  await db.query(
    "update statement_jobs set status = 'queued', locked_at = null, run_after = now() + make_interval(secs => $2) where statement_id = $1",
    [statementId, 30 * attempts],
  );
}
