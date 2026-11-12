# ADR 0002: Background jobs and paid plans in Postgres

Date: 2026-11-12 · Status: accepted

## Context
Statements were processed inside the upload request (up to 300 s per file), so closing the tab or a proxy
timeout could stop a file half way. Paid plans were decided (£9 one-off, £29 a year) but payments must stay
off in production until the legal details are settled. Cardlens runs as one app container next to its own
Postgres, with no Redis or separate worker host.

## Decision
- **Job queue in Postgres.** `statement_jobs` holds one row per statement. A worker started from
  `src/instrumentation.ts` inside the app process claims jobs with `FOR UPDATE SKIP LOCKED`, reclaims jobs left
  `running` for 10 minutes and gives up after 3 attempts. No new service, and the queue is backed up with
  everything else. The browser polls a status route instead of waiting on the request.
- **Entitlements in our database, Stripe as the source of payment events.** Stripe Checkout and the Billing
  Portal handle cards, receipts, invoices and cancelling. A signed webhook turns events into upserts on
  `entitlements` keyed by Stripe ids, with processed event ids recorded in `stripe_events`, so replays and
  out-of-order delivery are harmless. The app never calls Stripe to decide access.
- **One access check.** `src/lib/plans.ts` maps plans to features; pages, actions and routes ask
  `access.can(feature)`. `PAYMENTS_ENABLED=false` unlocks every feature, which is how production runs until
  payments go live.

## Consequences
- More app instances would each run a worker; that is safe with `SKIP LOCKED`, but heavy load would want a
  separate worker container (same image, `WORKER_ENABLED` on only there).
- Access depends on webhooks arriving; a misconfigured endpoint shows as "paid but still Free" (runbook
  covers it). Stripe retries failed deliveries for days.
- Reports are now keyed by a period (`period_key`) instead of a year; migration 0003 keeps a trigger so the
  previous release can still insert, but its `on conflict (user_id, year)` fails after the switch, so a
  rollback past 0003 disables report generation until rolled forward.
