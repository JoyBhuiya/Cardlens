import "server-only";
import { anonDb, userDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { claimJob, finishJob, MAX_JOB_ATTEMPTS, onWake, retryJobLater, type ClaimedJob } from "@/lib/jobs";
import { processStatement } from "@/lib/pipeline/run";

/**
 * In-process background worker: `concurrency` loops that claim statement jobs and run the pipeline.
 * Started once per server by src/instrumentation.ts. One app instance today (ARCHITECTURE.md §9); the
 * SKIP LOCKED claim means more instances would also be safe.
 */

const IDLE_POLL_MS = 3000;
const ERROR_BACKOFF_MS = 5000;

const globalForWorker = globalThis as unknown as { cardlensWorker?: { stop: () => void } };

/** Runs one claimed job. Exported for tests. */
export async function runJob(job: ClaimedJob): Promise<void> {
  if (job.attempts > MAX_JOB_ATTEMPTS) {
    // Kept crashing or timing out: give up and tell the user, rather than retrying forever.
    await userDb(job.user_id).query(
      "update statements set status = 'failed', error = $2 where id = $1 and status not in ('parsed', 'needs_review')",
      [job.statement_id, "Processing kept failing. Please try again, or upload the CSV export instead."],
    );
    await finishJob(anonDb, job.statement_id, "failed");
    return;
  }
  try {
    const result = await processStatement(userDb(job.user_id), job.user_id, job.statement_id);
    // The statements row now says parsed / needs_review / failed; the job itself is finished either way.
    await finishJob(anonDb, job.statement_id, result.status === "failed" ? "failed" : "done");
  } catch (err) {
    // processStatement records its own failures; reaching here means the database or disk itself failed.
    console.error("worker job error", err instanceof Error ? err.message : err);
    await retryJobLater(anonDb, job.statement_id, job.attempts).catch(() => undefined);
  }
}

function sleep(ms: number, signal: { stopped: boolean; wake?: () => void }): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal.wake = undefined;
      resolve();
    }
    signal.wake = done;
  });
}

export function startWorker(): void {
  if (globalForWorker.cardlensWorker || !serverEnv.workerEnabled()) return;
  const state = { stopped: false };
  const loops: { stopped: boolean; wake?: () => void }[] = [];

  async function loop(signal: { stopped: boolean; wake?: () => void }) {
    while (!state.stopped) {
      try {
        const job = await claimJob(anonDb);
        if (job) await runJob(job);
        else await sleep(IDLE_POLL_MS, signal);
      } catch (err) {
        console.error("worker loop error", err instanceof Error ? err.message : err);
        await sleep(ERROR_BACKOFF_MS, signal);
      }
    }
  }

  for (let i = 0; i < serverEnv.workerConcurrency(); i++) {
    const signal = { stopped: false } as { stopped: boolean; wake?: () => void };
    loops.push(signal);
    void loop(signal);
  }
  const unsubscribe = onWake(() => loops.forEach((l) => l.wake?.()));
  globalForWorker.cardlensWorker = {
    stop() {
      state.stopped = true;
      unsubscribe();
      loops.forEach((l) => l.wake?.());
    },
  };
  console.log(`statement worker started (${loops.length} loops)`);
}

export function stopWorker(): void {
  globalForWorker.cardlensWorker?.stop();
  globalForWorker.cardlensWorker = undefined;
}
