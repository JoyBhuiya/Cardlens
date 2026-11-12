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

## Open
- [ ] Joy: disconnect the old Vercel project and delete the Supabase project
- [ ] Run one real PDF statement through the live site (Anthropic path in production); check cost in `usage_events`
- [ ] Off-server backup copies; one restore test from a real dump
- [ ] Sign-in mail lands in Outlook Junk (SCL 5, all auth passes): watch; switch to 6-digit codes if testers keep hitting it
- [ ] Remove the duplicate `include:mx.ovh.com` in the brightnext.eu SPF record (harmless)

## Before charging anyone (blocking)
- [ ] Operating entity and seller of record (who, which country); IP ownership between the founders
- [ ] ICO fee, UK representative check (UK GDPR Art. 27), DPIA
- [ ] `/privacy` and `/terms`: fill `[Company name]`, `[privacy email]`, `[Hosting provider]`, `[location]`; processors are the hosting provider, Anthropic, Mailjet (later Stripe)
- [ ] Measure cost per statement from `usage_events` tokens before fixing prices

## Commercialisation (after the above)
- [ ] Decide: £9 one-off annual report (personal) + £29/yr (side business); park £49 professional
- [ ] Stripe Checkout + webhooks (verified, idempotent), `entitlements` + one `hasAccess()`; free tier = upload, reconcile, transactions, report teaser
