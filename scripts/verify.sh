#!/usr/bin/env bash
# Runs exactly what CI runs (.github/workflows/ci.yml): typecheck, lint, unit tests, a throwaway Postgres
# with the migrations, database tests, the production (standalone) build, and Playwright against that build.
# Needs Docker and the Playwright Chromium browser (`npx playwright install chromium`). No secrets: Claude is
# never called (unit tests mock it; e2e runs without a key and the report falls back to its template).
# Not covered here (deploy-only): the VPS stack in deploy/, Mailjet, real Claude calls.
set -euo pipefail
cd "$(dirname "$0")/.."

DB_PORT="${VERIFY_DB_PORT:-55439}"
APP_PORT="${VERIFY_APP_PORT:-3939}"
DB_NAME="cardlens-verify-$$"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/cardlens-verify.XXXXXX")"
APP_PID=""

cleanup() {
  if [ -n "$APP_PID" ]; then kill "$APP_PID" 2>/dev/null || true; fi
  docker rm -f "$DB_NAME" >/dev/null 2>&1 || true
  case "$WORK" in */cardlens-verify.*) rm -rf -- "$WORK" ;; esac
}
trap cleanup EXIT

step() { printf '\n== %s\n' "$*"; }

step "typecheck"; npm run typecheck
step "lint"; npm run lint
step "unit tests"; npm test

step "postgres"
OWNER_PW="verify-owner-$RANDOM$RANDOM"
APP_PW="verify-app-$RANDOM$RANDOM"
docker run -d --rm --name "$DB_NAME" -e POSTGRES_USER=cardlens -e POSTGRES_PASSWORD="$OWNER_PW" -e POSTGRES_DB=cardlens \
  -p "127.0.0.1:$DB_PORT:5432" postgres:16-alpine >/dev/null
for _ in $(seq 1 60); do
  docker exec "$DB_NAME" pg_isready -U cardlens -d cardlens -h 127.0.0.1 >/dev/null 2>&1 && break
  sleep 0.5
done
export MIGRATION_DATABASE_URL="postgres://cardlens:$OWNER_PW@127.0.0.1:$DB_PORT/cardlens"
export DATABASE_URL="postgres://cardlens_app:$APP_PW@127.0.0.1:$DB_PORT/cardlens"
APP_DB_PASSWORD="$APP_PW" npm run db:migrate

step "database tests"; npm run test:db

step "build"
NEXT_TELEMETRY_DISABLED=1 npm run build
cp -R .next/static .next/standalone/.next/static
cp -R public .next/standalone/public

step "e2e"
mkdir -p "$WORK/files" "$WORK/outbox"
NODE_ENV=production PORT="$APP_PORT" HOSTNAME=127.0.0.1 SITE_URL="http://localhost:$APP_PORT" \
  BETTER_AUTH_SECRET="$(openssl rand -base64 32)" IP_HASH_SALT="verify-salt" \
  STORAGE_DIR="$WORK/files" MAIL_OUTBOX_DIR="$WORK/outbox" \
  node .next/standalone/server.js >"$WORK/server.log" 2>&1 &
APP_PID=$!
for _ in $(seq 1 60); do
  curl -fsS "http://127.0.0.1:$APP_PORT/healthz" >/dev/null 2>&1 && break
  sleep 0.5
done
if ! E2E_BASE_URL="http://localhost:$APP_PORT" E2E_OUTBOX_DIR="$WORK/outbox" npx playwright test; then
  echo "--- server log"; cat "$WORK/server.log"
  exit 1
fi

step "verify passed"
