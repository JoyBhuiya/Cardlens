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

## Prerequisites (all done for the live site)
1. **DNS:** an `A` record `cardlens` in the `brightnext.eu` zone pointing at the VPS.
2. **Mailjet:** the domain `brightnext.eu` is validated in Mailjet (Senders & domains). SPF on the apex includes
   `include:spf.mailjet.com`; there must be exactly one `v=spf1` record. DKIM is the TXT record
   `mailjet._domainkey`. The app sends from `MAIL_FROM` (`no-reply@brightnext.eu`) with replies to
   `MAIL_REPLY_TO` (`hello@brightnext.eu`). Click and open tracking are switched off in the code on every send.
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
`MAIL_FROM`, `MAIL_REPLY_TO`, `ANTHROPIC_API_KEY`, `EDGE_CONTAINER` and `EDGE_SITES_DIR`. `SIGNIN_ALLOWLIST` is
empty on the live site (anyone can sign up); set it to comma-separated emails to restrict sign-in.

After changing `.env`, restart the app so it reads the new values (this keeps the recorded rollback target):
```bash
cd /opt/cardlens/stack && APP_VERSION=$(sed -n 's/^APP_VERSION=//p' release.env) docker compose up -d --no-deps cardlens-app
```

## Release

**Automatic:** every push to `main` runs `.github/workflows/ci.yml`. When `verify` passes, the `deploy` job SSHes
to the server with `deploy <sha>`. Its key is restricted in `~/.ssh/authorized_keys` to one forced command,
`/opt/cardlens/stack/deploy-hook.sh` (`restrict`: no shell, no forwarding). The hook deploys only the commit that
is the current head of `main` on GitHub. An older commit is skipped, because the newer push deploys itself. It
downloads that commit, refreshes the stack files from it, and runs `ops.sh release <commit>`.

**Manual** (fallback, same release path):
```bash
DEPLOY_HOST=<server> DEPLOY_USER=<admin> deploy/deploy.sh
```
It runs `scripts/verify.sh`, uploads the commit and the stack files, then runs `ops.sh release <commit>`.

Either way, `ops.sh release` builds the image, starts Postgres, backs up (`backups/pre-<commit>-*.dump`),
migrates, starts the app, waits for health, installs the edge site (validate everything, restore on failure,
then reload) and smoke-checks `https://cardlens.brightnext.eu/healthz` and the CSP header. On any failure it
starts the previous release again. Only one release runs at a time (lock in `ops.sh`). Migrations must stay
backward-compatible (add first, constrain later), so the previous app keeps working.

### Auto-deploy setup (once)
1. Make a key pair locally: `ssh-keygen -t ed25519 -N "" -C "github-actions deploy -> cardlens" -f ~/.ssh/cardlens_actions_deploy`.
2. On the server, append the public key to `~/.ssh/authorized_keys` as
   `command="/opt/cardlens/stack/deploy-hook.sh",restrict ssh-ed25519 AAAA… github-actions deploy -> cardlens`.
3. Add repository secrets: `VPS_HOST` (server address), `VPS_SSH_KEY` (the private key file),
   `VPS_KNOWN_HOSTS` (`ssh-keyscan -t ed25519 <server>`). Then delete the local private key.
Without the secrets, the deploy job ends with a notice and stays green. To revoke, delete that line from
`authorized_keys`.

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

## Troubleshooting
- **Deploy job red in GitHub:** open the run's `deploy` log. A failed health or smoke check has already rolled
  back to the previous release; fix the cause and push again. `skip: … no longer the head of main` is normal
  when pushes overlap.
- **`permission denied` on `~/.docker/buildx/.lock`:** files in `~ubuntu/.docker` owned by root (left by a
  `sudo docker` run). `sudo chown -R ubuntu:ubuntu ~ubuntu/.docker` fixes it. Never run docker with sudo here.
- **Sign-in mail in Junk at Outlook:** check the message source. If `spf`, `dkim` and `dmarc` all pass, it's
  domain reputation, which improves as people mark it "Not junk". If testers keep hitting it, switch to
  6-digit codes (Better Auth email-OTP plugin).
- **Mailjet "sender not validated":** the domain lost its validation in Mailjet. Re-validate it under
  Senders & domains (DNS TXT or a file on brightnext.eu).

## Not automated yet (owner decisions)
- Off-server backup copies (bucket and encryption key).
- A restore test from a real dump.
