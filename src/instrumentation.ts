/**
 * Runs once when the server starts. Starts the background statement worker (src/lib/worker.ts) in the
 * Node.js runtime only, and never during `next build`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (!process.env.DATABASE_URL) return; // e.g. a build or tool without a database
  const { startWorker } = await import("@/lib/worker");
  // Not awaited: the loops run for the life of the process. Shutdown is left to Next.js; a job cut off by a
  // deploy is picked up again after STALE_JOB_MINUTES by the next release (its statement is reclaimable).
  startWorker();
}
