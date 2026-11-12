# Runbook: deploy cardlens.brightnext.eu

Cardlens runs as compose project `cardlens` on a shared VPS behind the host's edge Caddy (another stack that
owns ports 80/443 and TLS and imports one site file per app). Server addresses, the edge container name and
its sites directory are not in this repository; they go into the server's `.env`.

```text
visitor ─https─> edge Caddy (TLS) ── docker network `edge` ──> cardlens-app:3000 (Next.js, non-root, read-only)
                                                                   │ network `backend` (internal)
                                                                   ├─> cardlens-postgres (pgdata volume)
                                                                   └── cardlens-backup (nightly pg_dump)
cardlens-app ──> Anthropic API, Mailjet (outbound through `edge`)
```

## Before the first release (owner)
1. **DNS:** an `A` record `cardlens` in the `brightnext.eu` zone pointing at the VPS.
2. **Mailjet:** a verified sender (for example `no-reply@brightnext.eu`) with SPF and DKIM for the domain.
3. **Anthropic:** an API key for this app, with a monthly spend limit set in the Anthropic console.
4. **Memory:** `docker stats --no-stream` on the host. Cardlens reserves about 1.1 GB (app 512 MB,
   Postgres 512 MB, backup 128 MB).

## Server preparation (once)
```bash
scp deploy/setup-vps.sh <admin>@<server>:
ssh <admin>@<server> sudo bash setup-vps.sh --dry-run
ssh <admin>@<server> sudo bash setup-vps.sh
```
Then fill in the empty values in `/opt/cardlens/stack/.env`: `MAILJET_API_KEY`, `MAILJET_API_SECRET`,
`MAIL_FROM`, `ANTHROPIC_API_KEY`, `EDGE_CONTAINER`, `EDGE_SITES_DIR`, and `SIGNIN_ALLOWLIST` (comma-separated
emails; keep it set during the closed beta).

## Release
```bash
DEPLOY_HOST=<server> DEPLOY_USER=<admin> deploy/deploy.sh
```
It runs `scripts/verify.sh`, uploads the commit and the stack files, then `ops.sh release <commit>` on the
server: build the image → start Postgres → back up (`backups/pre-<commit>-*.dump`) → migrate → start the app →
wait for health → install the edge site (validate everything, restore on failure, then reload) → smoke check
`https://cardlens.brightnext.eu/healthz` and the CSP header. On any failure it starts the previous release again.
Migrations must stay backward-compatible (add first, constrain later), so the previous app keeps working.

Tested end to end on a laptop with `bash deploy/tests/local-stack.sh` (mock edge, Playwright through it, a
broken release that rolls back).

## Operate
On the server, in `/opt/cardlens/stack`:
- `./ops.sh status` shows the current and previous releases, containers and memory.
- `./ops.sh logs [service]`.
- `./ops.sh rollback [commit]` starts the previous (or given) release.
- `./ops.sh backup` takes a manual dump. `./ops.sh prune` keeps the three newest builds.
- Restore: `docker compose exec -T cardlens-postgres pg_restore -U cardlens -d cardlens --clean < ../backups/<file>.dump`.
  Test a restore once after the first release.

## Not automated yet (owner decisions)
- Off-server backup copies (bucket and encryption key).
- GitHub Actions deploy: deploys go from the laptop for now; CI only verifies.
