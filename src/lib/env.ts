function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return value;
}

function int(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export const serverEnv = {
  // Read at runtime (not NEXT_PUBLIC_*), so one image serves any domain.
  siteUrl: () => process.env.SITE_URL ?? "http://localhost:3000",
  databaseUrl: () => required("DATABASE_URL", process.env.DATABASE_URL),
  authSecret: () => required("BETTER_AUTH_SECRET", process.env.BETTER_AUTH_SECRET),
  storageDir: () => process.env.STORAGE_DIR ?? ".data/statements",
  anthropicKey: () => required("ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY),
  extractModel: () => process.env.ANTHROPIC_EXTRACT_MODEL ?? "claude-sonnet-5-5",
  summaryModel: () => process.env.ANTHROPIC_SUMMARY_MODEL ?? "claude-sonnet-5-5",
  categoriseModel: () => process.env.ANTHROPIC_CATEGORISE_MODEL ?? "claude-haiku-5-5",
  uploadsPerDay: () => int(process.env.UPLOADS_PER_DAY, 60),
  /** Claude requests one user may trigger in 30 days (extraction, categorising, summaries). */
  aiCallsPerMonth: () => int(process.env.AI_CALLS_PER_USER_MONTH, 200),
  /** Claude requests across all users per 24 hours: the kill switch for runaway spend. */
  aiCallsPerDay: () => int(process.env.AI_CALLS_PER_DAY, 1000),
  /** Comma-separated emails allowed to sign in. Empty = anyone (open sign-up). */
  signInAllowlist: (): string[] =>
    (process.env.SIGNIN_ALLOWLIST ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  ipHashSalt: () => required("IP_HASH_SALT", process.env.IP_HASH_SALT),
  mailjetKey: () => process.env.MAILJET_API_KEY ?? "",
  mailjetSecret: () => process.env.MAILJET_API_SECRET ?? "",
  mailFrom: () => process.env.MAIL_FROM ?? "",
  /** Optional: where replies to app mail go (MAIL_FROM is usually a no-reply address). */
  mailReplyTo: () => process.env.MAIL_REPLY_TO ?? "",
  /** Development and e2e only: write outgoing mail as JSON files here instead of sending it. */
  mailOutboxDir: () => process.env.MAIL_OUTBOX_DIR ?? "",
};

export const LIMITS = {
  maxFileBytes: 10 * 1024 * 1024,
  maxFilesPerBatch: 12,
  reconcileTolerancePence: 100, // gap over £1 → needs_review
  categoriseBatchSize: 50,
  recurringMinMonths: 3,
  spikeFactor: 1.5,
  waitlistPerIpPerHour: 5,
} as const;
