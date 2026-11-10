function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return value;
}

export const publicEnv = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  siteUrl: () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
};

export const serverEnv = {
  serviceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
  anthropicKey: () => required("ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY),
  extractModel: () => process.env.ANTHROPIC_EXTRACT_MODEL ?? "claude-sonnet-5-5",
  summaryModel: () => process.env.ANTHROPIC_SUMMARY_MODEL ?? "claude-sonnet-5-5",
  categoriseModel: () => process.env.ANTHROPIC_CATEGORISE_MODEL ?? "claude-haiku-5-5",
  uploadsPerDay: () => Number(process.env.UPLOADS_PER_DAY ?? 60),
};

export const LIMITS = {
  maxFileBytes: 10 * 1024 * 1024,
  maxFilesPerBatch: 12,
  reconcileTolerancePence: 100, // gap over £1 → needs_review
  categoriseBatchSize: 50,
  recurringMinMonths: 3,
  spikeFactor: 1.5,
} as const;
