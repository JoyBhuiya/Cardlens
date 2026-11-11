# Cardlens: move to cardlens.brightnext.eu

## Done (branch `vps-postgres`)
- [x] Supabase → Postgres 16 (same schema, RLS via `app.user_id`), Better Auth magic link, disk storage
- [x] Spend caps (append-only `usage_events`), reprocess guard, waitlist rate limit, `/healthz`
- [x] `scripts/verify.sh` = CI: unit, DB (RLS isolation, caps, pipeline), build, Playwright incl. signed-in journey
- [x] Dockerfile, `deploy/` (compose, edge site, ops.sh, setup-vps.sh, deploy.sh), local stack test with rollback
- [x] Runbook `docs/runbooks/deploy.md`, ADR 0001, README

## Owner actions before the first release
- [ ] Agree the change with Joy (repo owner) and merge the PR
- [ ] DNS `A cardlens` → VPS; Mailjet sender with SPF/DKIM; Anthropic key with a spend limit
- [ ] `setup-vps.sh`, fill `.env` (incl. `SIGNIN_ALLOWLIST`), `deploy/deploy.sh`
- [ ] Off-server backup target; one restore test

## Before charging anyone (blocking)
- [ ] Operating entity and seller of record (who, which country); IP ownership between the founders
- [ ] ICO fee, UK representative check (UK GDPR Art. 27), DPIA
- [ ] `/privacy` and `/terms`: placeholders, and processors (Supabase and Vercel are gone; add the hosting provider, Anthropic, Mailjet, later Stripe)
- [ ] Measure cost per statement from `usage_events` tokens before fixing prices

## Commercialisation (after the above)
- [ ] Decide: £9 one-off annual report (personal) + £29/yr (side business); park £49 professional
- [ ] Stripe Checkout + webhooks (verified, idempotent), `entitlements` + one `hasAccess()`; free tier = upload, reconcile, transactions, report teaser
