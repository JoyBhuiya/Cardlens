# Cardlens

Turns up to 12 months of UK credit card statements into a reconciled annual report: spend vs payments, where the money goes, and costed saving ideas with a professional summary.

Next.js 16 (App Router, TypeScript strict) · Tailwind 4 · Supabase (London, eu-west-2) · Claude API · Vercel (`lhr1`).

## Setup

1. **Supabase**: create a project in **eu-west-2 (London)**. Run `supabase/migrations/0001_init.sql` in the SQL editor (or `supabase db push`). It creates all tables, RLS policies, system categories and the private `statements` storage bucket.
2. **Auth**: Supabase → Authentication → URL configuration: set Site URL to your domain and add `http://localhost:3000/auth/confirm` and `https://YOUR-DOMAIN/auth/confirm` to redirect URLs. Email (magic link) provider on.
3. **Env**: `cp .env.example .env.local` and fill in the Supabase URL, anon key, service-role key and Anthropic key.
4. `npm install && npm run dev` → http://localhost:3000

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run check` | Typecheck, lint, unit tests and production build |
| `npm test` | Vitest unit tests (pipeline maths, reconciliation, dedupe, CSV, analytics, summary validator) |
| `npm run test:e2e` | Playwright at 1440 px and 375 px (landing, waitlist, auth guard, security headers) |
| `npm run schemas` | Regenerates `schemas/*.schema.json` from the Zod sources |

## How it works

```
browser ──upload──▶ Supabase Storage (private, <user_id>/…)
   │
   └─POST /api/statements/:id/process (up to 300 s per file, London)
        1 Upload      statements row, status uploaded
        2 Extract     PDF → Claude document block → schema-valid JSON  (CSV → papaparse + column mapping)
        3 Mask/normalise  last-4 only, ISO dates, pence, merchant clean-up (user rules → data/merchant-aliases.json)
        4 Reconcile   opening + debits − credits = closing, to the penny; gap > £1 → needs_review
                      dedupe_hash drops lines repeated across overlapping statements
        5 Classify    rules first (payment, interest, fee, cash, balance transfer, refund), Claude's kind as fallback
        6 Categorise  user rules → dictionary → Haiku-class model (batches of 50); recurring = 3+ months
      file deleted once parsed (unless the user opts to keep it)
```

- **Every number** in the report is computed in `src/lib/analytics.ts`. Claude only writes words around the metrics; `src/lib/summary/validate.ts` rejects any £ figure that isn't in, or arithmetically derived from, the metrics, retries once, then falls back to `template.ts`.
- **Security**: browser only ever holds the anon key; all AI and admin work is server-side; RLS on every table and storage path; strict CSP, HSTS, `X-Frame-Options: DENY`, no third-party scripts (fonts are self-hosted); 12 files/batch, 10 MB/file, 60 uploads/user/day; honeypot on the waitlist.
- **Models** are set by env: `ANTHROPIC_EXTRACT_MODEL`, `ANTHROPIC_SUMMARY_MODEL`, `ANTHROPIC_CATEGORISE_MODEL`.

## Layout

```
src/app/                 routes (/, /login, /app/*, /privacy, /terms, /api/*)
src/lib/pipeline/        schema, csv, normalise, classify, reconcile, dedupe, recurring, transform (pure), run (DB)
src/lib/ai/              Claude client, extraction, categorising
src/lib/summary/         schema, generate, validate, template
src/prompts/             extract-statement, categorise, annual-summary
src/data/merchant-aliases.json   ~200 UK merchants → name + category
design/tokens.css        colour tokens (light + dark)
supabase/migrations/     0001_init.sql
fixtures/                sample statement extraction (reconciles) and CSVs
tests/unit, tests/e2e
```

## Before launch

ICO registration, DPIA, legal review of `/privacy`, `/terms` and saving-idea wording; fill in `[Company name]` placeholders; test with one real (redacted) statement from each of the first 4–5 issuers; set Vercel env vars and deploy.
