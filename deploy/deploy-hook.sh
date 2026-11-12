#!/usr/bin/env bash
# The only command the GitHub Actions deploy key may run on the server (forced via `command=` in
# ~/.ssh/authorized_keys). The job sends `deploy <sha>` after CI's verify passed for that commit.
#
# It deploys only the commit that is the current head of `main` on GitHub: an older sha (a newer push is on its
# way and will deploy itself) is skipped, and nothing that isn't main can be deployed with this key. The code is
# downloaded from GitHub here, so the key never carries code. Stack files (compose, ops.sh, edge site, this hook)
# are refreshed from that commit, then `ops.sh release` does the rest (build, backup, migrate, health, edge,
# smoke, automatic rollback). This file runs as the OLD version during a deploy that changes it: keep it small.
set -euo pipefail
REPO="${CARDLENS_REPO:-JoyBhuiya/Cardlens}"
ROOT=/opt/cardlens
STACK="$ROOT/stack"

read -r verb sha extra <<<"${SSH_ORIGINAL_COMMAND:-}" || true
if [ "${verb:-}" != deploy ] || ! [[ "${sha:-}" =~ ^[0-9a-f]{40}$ ]] || [ -n "${extra:-}" ]; then
  echo "usage: deploy <40-character commit sha>" >&2
  exit 2
fi

head="$(git ls-remote "https://github.com/$REPO.git" refs/heads/main | cut -f1)"
[[ "$head" =~ ^[0-9a-f]{40}$ ]] || { echo "could not read main from GitHub" >&2; exit 1; }
if [ "$sha" != "$head" ]; then
  echo "skip: $sha is no longer the head of main ($head will deploy itself)"
  exit 0
fi
if [ "$(sed -n 's/^APP_VERSION=//p' "$STACK/release.env" 2>/dev/null)" = "$sha" ]; then
  echo "skip: $sha is already live"
  exit 0
fi

src="$ROOT/src/$sha"
if [ ! -d "$src" ]; then
  echo "==> downloading $sha"
  tmp="$(mktemp -d "$ROOT/src/.download.XXXXXX")"
  curl -fsSL --max-time 120 "https://codeload.github.com/$REPO/tar.gz/$sha" | tar -xz -C "$tmp" --strip-components=1
  mv "$tmp" "$src"
fi

install -m 0640 "$src/deploy/compose.yaml" "$STACK/compose.yaml"
install -m 0750 "$src/deploy/ops.sh" "$STACK/ops.sh"
install -m 0750 "$src/deploy/deploy-hook.sh" "$STACK/deploy-hook.sh"
mkdir -p "$STACK/edge" && install -m 0640 "$src/deploy/edge/cardlens.caddy" "$STACK/edge/cardlens.caddy"

"$STACK/ops.sh" release "$sha"
"$STACK/ops.sh" prune
