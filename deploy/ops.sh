#!/usr/bin/env bash
# Server-side operations for the Cardlens stack. Lives in /opt/cardlens/stack next to compose.yaml and .env.
#
#   ops.sh release <commit>   build the image from /opt/cardlens/src/<commit>, back up, migrate, start,
#                             install the edge site, smoke-check; rolls back to the previous app on failure
#   ops.sh rollback [commit]  start the previous (or given) app image again
#   ops.sh status | logs [service] | backup | prune
#
# Settings come from .env (see setup-vps.sh), including EDGE_CONTAINER and EDGE_SITES_DIR for the shared edge
# Caddy (EDGE_SUDO= empty only in deploy/tests). Those host details stay on the server; this repository is public.
set -euo pipefail
STACK="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$STACK")"
cd "$STACK"
[ -f .env ] || { echo ".env missing in $STACK (run setup-vps.sh)" >&2; exit 1; }
set -a
# shellcheck disable=SC1091
. ./.env
set +a

current() { sed -n 's/^APP_VERSION=//p' release.env 2>/dev/null || true; }
previous() { sed -n 's/^PREVIOUS_VERSION=//p' release.env 2>/dev/null || true; }
compose() { APP_VERSION="${APP_VERSION:-$(current)}" docker compose "$@"; }

wait_healthy() {
  local id status
  id="$(compose ps -q cardlens-app)"
  for _ in $(seq 1 60); do
    status="$(docker inspect -f '{{.State.Health.Status}}' "$id" 2>/dev/null || echo starting)"
    [ "$status" = healthy ] && return 0
    sleep 2
  done
  echo "app did not become healthy (last: $status)" >&2
  return 1
}

install_edge_site() {
  local src="$STACK/edge/cardlens.caddy" site="${EDGE_SITES_DIR:?}/cardlens.caddy" container="${EDGE_CONTAINER:?}"
  local sudo="${EDGE_SUDO-sudo}" owner=()
  [ -n "$sudo" ] && owner=(-o root -g root)
  if cmp -s "$src" "$site"; then echo "==> edge site unchanged"; return 0; fi
  local backup had=0 out
  backup="$(mktemp)"
  if [ -f "$site" ]; then $sudo cp "$site" "$backup"; had=1; fi
  $sudo install -m 0644 ${owner[@]+"${owner[@]}"} "$src" "$site"
  if ! out="$(docker exec "$container" caddy validate --config /etc/caddy/Caddyfile 2>&1)"; then
    echo "$out" | tail -5 >&2
    if [ "$had" = 1 ]; then $sudo install -m 0644 ${owner[@]+"${owner[@]}"} "$backup" "$site"; else $sudo rm -f -- "$site"; fi
    rm -f -- "$backup"
    echo "edge validation failed; previous site file restored, edge not reloaded" >&2
    return 1
  fi
  docker exec "$container" caddy reload --config /etc/caddy/Caddyfile
  rm -f -- "$backup"
  echo "==> edge reloaded"
}

smoke() {
  local base="${SITE_URL%/}" code
  for _ in $(seq 1 15); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$base/healthz" || true)"
    [ "$code" = 200 ] && break
    sleep 2
  done
  [ "$code" = 200 ] || { echo "smoke: $base/healthz answered $code" >&2; return 1; }
  curl -sSI --max-time 10 "$base/" | grep -qi '^content-security-policy:' || { echo "smoke: CSP header missing" >&2; return 1; }
  echo "==> smoke ok ($base)"
}

backup() {
  local name="${1:-manual}" f
  f="$ROOT/backups/$name-$(date -u +%Y%m%dT%H%M%SZ).dump"
  (umask 077 && compose exec -T cardlens-postgres pg_dump -Fc -U cardlens cardlens >"$f")
  echo "==> backup $f"
}

start_app() {
  APP_VERSION="$1" docker compose up -d --no-deps cardlens-app
  APP_VERSION="$1" wait_healthy
}

release() {
  local sha="${1:?usage: ops.sh release <commit>}" src="$ROOT/src/$1" prev
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "commit must be a full 40-character sha" >&2; exit 1; }
  [ -d "$src" ] || { echo "$src missing (deploy.sh uploads it)" >&2; exit 1; }
  # One release at a time: laptop deploys and GitHub Actions deploys wait for each other.
  # (flock is part of util-linux on the server; the macOS stack test runs without it.)
  if command -v flock >/dev/null; then
    exec 9>"$STACK/.release.lock"
    flock -w 1200 9 || { echo "another release is still running" >&2; exit 1; }
  fi
  docker network inspect edge >/dev/null 2>&1 || { echo "docker network 'edge' missing" >&2; exit 1; }
  prev="$(current)"

  echo "==> building cardlens-app:$sha"
  docker build -q -t "cardlens-app:$sha" "$src"

  export APP_VERSION="$sha"
  docker compose up -d cardlens-postgres cardlens-backup
  docker compose exec -T cardlens-postgres sh -c 'until pg_isready -U cardlens -d cardlens >/dev/null; do sleep 1; done'
  backup "pre-$sha"

  echo "==> migrating"
  docker compose run --rm --no-deps \
    -e MIGRATION_DATABASE_URL="postgres://cardlens:${POSTGRES_PASSWORD}@cardlens-postgres:5432/cardlens" \
    -e APP_DB_PASSWORD="$APP_DB_PASSWORD" \
    cardlens-app node scripts/migrate.mjs

  echo "==> starting app $sha"
  if start_app "$sha" && install_edge_site && smoke; then
    printf 'APP_VERSION=%s\nPREVIOUS_VERSION=%s\n' "$sha" "$prev" >release.env
    echo "==> release $sha is live"
    return 0
  fi
  echo "release $sha failed" >&2
  if [ -n "$prev" ]; then
    echo "==> rolling back to $prev (migrations are backward-compatible by policy)" >&2
    start_app "$prev" || true
  fi
  exit 1
}

rollback() {
  local to="${1:-$(previous)}"
  [ -n "$to" ] || { echo "no previous release recorded" >&2; exit 1; }
  docker image inspect "cardlens-app:$to" >/dev/null || { echo "image cardlens-app:$to not on this host" >&2; exit 1; }
  start_app "$to"
  printf 'APP_VERSION=%s\nPREVIOUS_VERSION=%s\n' "$to" "$(current)" >release.env
  echo "==> rolled back to $to"
}

# Keep the three newest source trees and images; never the current or previous one.
prune() {
  local keep cur prev
  cur="$(current)"; prev="$(previous)"
  # shellcheck disable=SC2012 # entries are commit shas only
  keep="$(ls -1t "$ROOT/src" | head -3)"
  for d in "$ROOT"/src/*; do
    local name; name="$(basename "$d")"
    [[ "$name" =~ ^[0-9a-f]{40}$ ]] || continue
    if ! grep -qx "$name" <<<"$keep" && [ "$name" != "$cur" ] && [ "$name" != "$prev" ]; then
      rm -rf -- "${ROOT:?}/src/$name"
      docker image rm "cardlens-app:$name" >/dev/null 2>&1 || true
      echo "pruned $name"
    fi
  done
}

case "${1:-}" in
  release) release "${2:-}" ;;
  rollback) rollback "${2:-}" ;;
  status) echo "current: $(current)  previous: $(previous)"; compose ps; mapfile -t ids < <(compose ps -q); [ ${#ids[@]} -eq 0 ] || docker stats --no-stream "${ids[@]}" ;;
  logs) compose logs --tail=200 "${2:-cardlens-app}" ;;
  backup) backup manual ;;
  prune) prune ;;
  *) sed -n '2,10p' "$0"; exit 1 ;;
esac
