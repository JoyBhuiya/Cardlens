# Cardlens

## Done (2026-11-12)
- [x] Supabase → Postgres 16 (same schema, RLS via `app.user_id`), Better Auth magic link, disk storage
- [x] Spend caps (append-only `usage_events`), reprocess guard, waitlist rate limit, `/healthz`
- [x] `scripts/verify.sh` = CI: unit, DB (RLS isolation, caps, pipeline), build, Playwright incl. signed-in journey
- [x] Dockerfile, `deploy/` (compose, edge site, ops.sh, setup-vps.sh, deploy.sh), local stack test with rollback
- [x] Live at https://cardlens.brightnext.eu: DNS, TLS, Mailjet domain with SPF/DKIM, Anthropic key, open sign-up
- [x] Branded sign-in email; Mailjet tracking off
- [x] Auto-deploy: push to `main` → verify → deploy (forced-command key, current-head-only hook)
- [x] Runbook `docs/runbooks/deploy.md`, ADR 0001, README

## Done (branch feat/subscriptions-and-refinements)
- [x] 6-digit sign-in codes (email-OTP, hashed, 5 attempts, scanner-safe link)
- [x] Background processing: `statement_jobs` queue + in-process worker, status polling, retry
- [x] Report periods: calendar year, UK tax year, any 12 months (Insights and report)
- [x] Plans + entitlements, Stripe Checkout / Portal / webhook (idempotent), `PAYMENTS_ENABLED` switch
- [x] Legal placeholders in one place (`src/lib/legal.ts`), Stripe in privacy/terms, free data download

## Open
- [ ] Joy: disconnect the old Vercel project and delete the Supabase project
- [ ] Run one real PDF statement through the live site (Anthropic path in production); check cost in `usage_events`
- [ ] Off-server backup copies; one restore test from a real dump
- [ ] Remove the duplicate `include:mx.ovh.com` in the brightnext.eu SPF record (harmless)

## Before charging anyone (blocking)
- [ ] Operating entity and seller of record (who, which country); IP ownership between the founders
- [ ] ICO fee, UK representative check (UK GDPR Art. 27), DPIA
- [ ] Fill `src/lib/legal.ts` (company name and number, registered address, privacy email, ICO number, hosting provider and location); have privacy/terms reviewed
- [ ] Measure cost per statement from `usage_events` tokens before fixing prices

## Turning payments on
- [ ] Stripe account (test mode first): products £9 one-off and £29 yearly, Customer Portal, webhook (see runbook)
- [ ] Server `.env`: `STRIPE_*` keys; test end to end with `PAYMENTS_ENABLED=true` on a test key
- [ ] Live keys + live webhook, then `PAYMENTS_ENABLED=true` in production
- [ ] Later: remove the magicLink plugin (kept only so old links fail cleanly); £49 Professional tier
