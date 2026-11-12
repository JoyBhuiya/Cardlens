#!/usr/bin/env bash
# The deploy path, production-shaped, on the laptop (Docker only; never touches a server):
#   1. the real edge site file validates in Caddy
#   2. setup-vps.sh-style .env, then `ops.sh release <commit>` builds, backs up, migrates, starts the stack and
#      installs the site into a mock edge Caddy (plain HTTP on localhost:8088, since TLS is the edge's job)
#   3. Playwright's signed-out suite runs through that edge (headers, waitlist into Postgres, auth guard)
#   4. a broken release (app exits at start) fails its health check and ops.sh rolls back to the good one
# Usage: bash deploy/tests/local-stack.sh   (about 5 minutes; cleans up after itself)
set -euo pipefail
cd "$(dirname "$0")/../.."
REPO="$(pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/cardlens-stack.XXXXXX")"
EDGE_NAME="cardlens-test-edge"
CREATED_EDGE_NET=0
PORT=8088

cleanup() {
  set +e
  if [ -f "$WORK/root/stack/.env" ]; then
    (cd "$WORK/root/stack" && APP_VERSION=x docker compose down -v --remove-orphans >/dev/null 2>&1)
  fi
  docker rm -f "$EDGE_NAME" >/dev/null 2>&1
  [ "$CREATED_EDGE_NET" = 1 ] && docker network rm edge >/dev/null 2>&1
  case "$WORK" in */cardlens-stack.*) rm -rf -- "$WORK" ;; esac
}
trap cleanup EXIT
step() { printf '\n== %s\n' "$*"; }

step "edge site file validates"
docker run --rm -v "$REPO/deploy/edge/cardlens.caddy:/etc/caddy/Caddyfile:ro" caddy:2.11.7-alpine \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
echo "ok"

step "server layout"
SHA="$(git rev-parse HEAD)"
ROOT="$WORK/root"
mkdir -p "$ROOT/stack" "$ROOT/src/$SHA" "$ROOT/backups" "$WORK/sites"
git archive --format=tar HEAD | tar -x -C "$ROOT/src/$SHA"
cp -R deploy/compose.yaml deploy/ops.sh deploy/edge "$ROOT/stack/"
# The test serves plain HTTP on localhost; the real file (validated above) uses the public host name.
printf 'http://localhost:%s {\n\treverse_proxy cardlens-app:3000\n}\n' "$PORT" >"$ROOT/stack/edge/cardlens.caddy"
gen() { openssl rand -hex 24; }
cat >"$ROOT/stack/.env" <<EOF
SITE_URL=http://localhost:$PORT
POSTGRES_PASSWORD=$(gen)
APP_DB_PASSWORD=$(gen)
BETTER_AUTH_SECRET=$(gen)
IP_HASH_SALT=$(gen)
EDGE_CONTAINER=$EDGE_NAME
EDGE_SITES_DIR=$WORK/sites
EDGE_SUDO=
BACKUP_DIR=$ROOT/backups
EOF
chmod 600 "$ROOT/stack/.env"

step "mock edge Caddy"
if ! docker network inspect edge >/dev/null 2>&1; then docker network create edge >/dev/null; CREATED_EDGE_NET=1; fi
printf '{\n\tadmin localhost:2019\n}\nimport /etc/caddy/sites/*.caddy\n' >"$WORK/Caddyfile"
docker run -d --name "$EDGE_NAME" --network edge -p "127.0.0.1:$PORT:$PORT" \
  -v "$WORK/Caddyfile:/etc/caddy/Caddyfile:ro" -v "$WORK/sites:/etc/caddy/sites:ro" caddy:2.11.7-alpine >/dev/null

step "release $SHA"
bash "$ROOT/stack/ops.sh" release "$SHA"
compgen -G "$ROOT/backups/pre-$SHA-*.dump" >/dev/null || { echo "pre-migration backup missing" >&2; exit 1; }

step "e2e through the edge"
E2E_BASE_URL="http://localhost:$PORT" npx playwright test tests/e2e/happy-path.spec.ts tests/e2e/signed-in.spec.ts

step "broken release rolls back"
BAD="$(printf 'broken' | shasum | cut -c1-40)"
mkdir -p "$ROOT/src/$BAD"
git archive --format=tar HEAD | tar -x -C "$ROOT/src/$BAD"
sed -i.bak 's/^CMD \["node", "server.js"\]/CMD ["node", "-e", "process.exit(1)"]/' "$ROOT/src/$BAD/Dockerfile"
if bash "$ROOT/stack/ops.sh" release "$BAD"; then echo "broken release was accepted" >&2; exit 1; fi
curl -fsS "http://localhost:$PORT/healthz" >/dev/null || { echo "app not healthy after rollback" >&2; exit 1; }
grep -q "^APP_VERSION=$SHA$" "$ROOT/stack/release.env" || { echo "release.env does not point at the good release" >&2; exit 1; }
echo "rolled back to $SHA"

step "local stack test passed"
