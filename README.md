# Cardlens

Turns up to 12 months of UK credit card statements into a reconciled annual report: spend vs payments, where the money goes, and costed saving ideas with a professional summary.

Next.js 16 (App Router, TypeScript strict) · Tailwind 4 · Postgres 16 with row-level security · Better Auth (magic link) · Claude API · Mailjet for sign-in emails · self-hosted with Docker at https://cardlens.brightnext.eu.

## Setup

1. `cp .env.example .env.local` and fill in the values (see the comments in the file).
2. Postgres: `docker run -d --name cardlens-pg -e POSTGRES_USER=cardlens -e POSTGRES_PASSWORD=<pw> -e POSTGRES_DB=cardlens -p 55432:5432 postgres:16-alpine`.
3. `npm install && npm run db:migrate` (uses `MIGRATION_DATABASE_URL`; `APP_DB_PASSWORD` sets the app role's password).
4. `npm run dev` → http://localhost:3000. Sign-in mails land in `MAIL_OUTBOX_DIR` as JSON files when Mailjet isn't configured.

Deploying: [docs/runbooks/deploy.md](docs/runbooks/deploy.md). Why no Supabase: [docs/adr/0001](docs/adr/0001-self-hosted-postgres-instead-of-supabase.md).

## Hosting

Production runs on Brightnext's own server at **https://cardlens.brightnext.eu**: a Docker compose stack (app, Postgres, nightly backup) behind the server's Caddy, which handles TLS. Full steps: [docs/runbooks/deploy.md](docs/runbooks/deploy.md).

- **Deploy:** `DEPLOY_HOST=<server> deploy/deploy.sh` from a clean checkout of `main`. It runs `scripts/verify.sh`, builds the image on the server, backs up, migrates, swaps the app and rolls back on failure. Pushing to GitHub runs CI only; it does not deploy.
- **Env vars:** the server's `/opt/cardlens/stack/.env` (created by `deploy/setup-vps.sh`); keep it in step with `.env.example`. `SITE_URL` is read at runtime, so no rebuild is needed when it changes.
- **Timeouts:** statement processing can take 1–2 minutes per PDF; the edge proxy allows 320 s (`deploy/edge/cardlens.caddy`).
- **HTTPS required:** the app sends HSTS.
- **Sign-in emails:** sent by the app through Mailjet's API (`MAILJET_API_KEY`, `MAILJET_API_SECRET`, `MAIL_FROM`); turn off click tracking for that key so magic links aren't rewritten.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run check` | `scripts/verify.sh`: exactly what CI runs (typecheck, lint, unit, throwaway Postgres + DB tests, build, Playwright). Needs Docker |
| `npm test` | Vitest unit tests (pipeline maths, reconciliation, dedupe, CSV, analytics, summary validator, storage) |
| `npm run test:db` | Database tests: RLS isolation, spend caps, waitlist, pipeline on Postgres (needs `DATABASE_URL`; run through verify) |
| `npm run test:e2e` | Playwright at 1440 px and 375 px against `E2E_BASE_URL`, including the signed-in upload → report journey |
| `npm run db:migrate` | Applies `db/migrations/*.sql` once each |
| `npm run schemas` | Regenerates `schemas/*.schema.json` from the Zod sources |
| `bash deploy/tests/local-stack.sh` | The deploy path on the laptop: real `ops.sh` release behind a mock edge, e2e through it, forced rollback |

## How it works

```
browser ──POST /api/statements/upload──▶ disk volume (<user_id>/<uuid>.pdf|csv, owner-checked)
   │
   └─POST /api/statements/:id/process (up to 300 s per file — reverse-proxy timeout must allow this)
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
- **Security**: the browser talks only to our origin; all AI and database work is server-side. RLS on every user table: the app connects as `cardlens_app` and sets `app.user_id` per transaction (`src/lib/db`). Strict CSP, HSTS, `X-Frame-Options: DENY`, no third-party scripts (fonts are self-hosted).
- **Limits** (append-only `usage_events` ledger, so deleting statements doesn't reset them): 12 files/batch, 10 MB/file, `UPLOADS_PER_DAY` per user, `AI_CALLS_PER_USER_MONTH` per user, `AI_CALLS_PER_DAY` across everyone (kill switch). A parsed or in-flight statement can't be reprocessed. Waitlist: honeypot plus 5 sign-ups per hashed IP per hour. Token counts per Claude call are recorded for unit economics.
- **Closed beta**: `SIGNIN_ALLOWLIST` limits who receives a sign-in link.
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
db/migrations/           0001_init.sql (schema, RLS), 0002 (usage ledger, rate limits)
deploy/                  compose stack, edge site, ops.sh, setup-vps.sh, deploy.sh, tests/
src/lib/db, auth.ts, session.ts, storage.ts, usage.ts   Postgres, Better Auth, files, limits
fixtures/                sample statement extraction (reconciles) and CSVs
tests/unit, tests/db, tests/e2e
```

## Before launch

ICO registration, DPIA, legal review of `/privacy`, `/terms` and saving-idea wording; fill in `[Company name]`, `[Hosting provider]` and `[location]` placeholders on `/privacy`; test with one real (redacted) statement from each of the first 4–5 issuers; keep the server's env vars in step with `.env.example`; complete the owner steps in [docs/runbooks/deploy.md](docs/runbooks/deploy.md).
