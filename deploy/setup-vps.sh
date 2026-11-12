#!/usr/bin/env bash
# One-time server preparation for Cardlens (rerun-safe). Run on the VPS as the admin user with sudo:
#   sudo bash setup-vps.sh --dry-run
#   sudo bash setup-vps.sh
# Creates /opt/cardlens/{stack,src,backups} owned by the invoking user and /opt/cardlens/stack/.env (0600)
# with generated secrets. Prints key names only, never values. A rerun adds missing keys and never replaces a
# value. Touches nothing outside /opt/cardlens.
set -euo pipefail
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1
ROOT=/opt/cardlens
OWNER="${SUDO_USER:-$(id -un)}"
ENV_FILE="$ROOT/stack/.env"

run() { if [ "$DRY" = 1 ]; then echo "would run: $*"; else "$@"; fi; }

[ "$(id -u)" = 0 ] || { echo "run with sudo" >&2; exit 1; }
command -v docker >/dev/null || { echo "docker missing" >&2; exit 1; }
docker compose version >/dev/null || { echo "docker compose plugin missing" >&2; exit 1; }
docker network inspect edge >/dev/null 2>&1 || echo "WARNING: docker network 'edge' missing (the edge Caddy stack creates it)"
free -m | awk '/^Mem:/ { if ($7 < 1500) print "WARNING: only " $7 " MB available; Cardlens needs about 1.1 GB" }'
df -Pm / | awk 'NR==2 { if ($4 < 5000) print "WARNING: only " $4 " MB free disk" }'

for d in stack src backups; do run install -d -m 0750 -o "$OWNER" -g "$OWNER" "$ROOT/$d"; done
run install -d -m 0750 -o "$OWNER" -g "$OWNER" "$ROOT/stack/edge"

gen() { openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-48; }
add_key() {
  local key=$1 value=$2
  if [ -f "$ENV_FILE" ] && grep -q "^$key=" "$ENV_FILE"; then echo "keep  $key"; return; fi
  echo "add   $key"
  [ "$DRY" = 1 ] || printf '%s=%s\n' "$key" "$value" >>"$ENV_FILE"
}

if [ "$DRY" = 0 ]; then
  touch "$ENV_FILE"
  chown "$OWNER:$OWNER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi
add_key SITE_URL "https://cardlens.brightnext.eu"
add_key POSTGRES_PASSWORD "$(gen)"
add_key APP_DB_PASSWORD "$(gen)"
add_key BETTER_AUTH_SECRET "$(gen)"
add_key IP_HASH_SALT "$(gen)"
# Filled in by the owner (empty means: not configured yet).
add_key SIGNIN_ALLOWLIST ""
add_key MAILJET_API_KEY ""
add_key MAILJET_API_SECRET ""
add_key MAIL_FROM ""
add_key ANTHROPIC_API_KEY ""
add_key PAYMENTS_ENABLED "false"
add_key STRIPE_SECRET_KEY ""
add_key STRIPE_WEBHOOK_SECRET ""
add_key STRIPE_PRICE_PERSONAL ""
add_key STRIPE_PRICE_SIDE_BUSINESS ""
add_key EDGE_CONTAINER ""
add_key EDGE_SITES_DIR ""
echo "done. Fill in the empty values in $ENV_FILE (they are listed above as added with no value)."
