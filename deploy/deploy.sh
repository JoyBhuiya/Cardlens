#!/usr/bin/env bash
# Laptop → VPS release of the current commit. Runs scripts/verify.sh first (set SKIP_VERIFY=1 only if it
# just passed for this exact commit), uploads the source tree and the stack files, then runs
# `ops.sh release <commit>` on the server (build, backup, migrate, start, edge, smoke, auto-rollback).
#
#   DEPLOY_HOST=<server> [DEPLOY_USER=ubuntu] deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."
HOST="${DEPLOY_HOST:?set DEPLOY_HOST}"
USER_AT="${DEPLOY_USER:-ubuntu}@$HOST"

[ -z "$(git status --porcelain)" ] || { echo "working tree not clean; commit first" >&2; exit 1; }
SHA="$(git rev-parse HEAD)"
[ "${SKIP_VERIFY:-0}" = 1 ] || bash scripts/verify.sh

echo "==> uploading $SHA"
# shellcheck disable=SC2029 # the commit is meant to expand on this machine
git archive --format=tar "$SHA" | ssh "$USER_AT" "set -e; d=/opt/cardlens/src/$SHA; mkdir -p \$d; tar -x -C \$d"
tar -C deploy -cf - compose.yaml ops.sh deploy-hook.sh edge | ssh "$USER_AT" "tar -x -C /opt/cardlens/stack && chmod 750 /opt/cardlens/stack/ops.sh /opt/cardlens/stack/deploy-hook.sh"

echo "==> releasing"
# shellcheck disable=SC2029
ssh "$USER_AT" "/opt/cardlens/stack/ops.sh release $SHA"
