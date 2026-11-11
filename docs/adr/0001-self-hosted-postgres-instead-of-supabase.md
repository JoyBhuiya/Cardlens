# ADR 0001: Self-hosted Postgres, Better Auth and disk storage instead of Supabase

Date: 2026-11-11 · Status: accepted

## Context
The MVP used Supabase for the database, magic-link auth, row-level security (`auth.uid()`) and file storage,
and ran on Vercel. Cardlens now runs on a shared VPS next to other apps, with its own Postgres. The schema
and the RLS guarantee should stay the same.

## Decision
- **Postgres 16** in the app's own compose stack. `db/migrations/*.sql` (plain SQL, run by
  `scripts/migrate.mjs` as the owner) keep the original tables, enums, indexes and policies.
- **RLS stays.** Policies compare `user_id` with `app.current_user_id()`, which reads `app.user_id`. The app
  connects as `cardlens_app` (not the owner, so RLS applies) and sets `app.user_id` per transaction through
  `userDb(userId)` in `src/lib/db`. Each call is a short transaction; the pipeline never holds one open across
  a Claude request.
- **Plain `pg`, no ORM.** The queries are simple, Better Auth supports a `pg` pool natively, and SQL mirrors
  the migration one to one.
- **Better Auth** (magic link) replaces Supabase Auth; its four tables live in the same database (uuid ids).
  Mail goes through Mailjet; in development and e2e, `MAIL_OUTBOX_DIR` captures it as files.
- **Files on a Docker volume** (`STORAGE_DIR`), uploaded through `POST /api/statements/upload` instead of
  directly from the browser to Supabase Storage. Paths are checked against the owner; files are deleted
  after a successful parse, as before.

## Consequences
- No Supabase or Vercel processors; the browser talks only to our origin (CSP `connect-src 'self'`).
- We run backups ourselves (nightly `pg_dump` plus one before every migration; off-server copies are an owner
  task).
- Every user query must go through `userDb`. `anonDb` sees no user rows (tested in `tests/db/rls.test.ts`).
- The browser no longer has database access, but spend caps now live in an append-only `usage_events` ledger
  rather than counting deletable rows.
