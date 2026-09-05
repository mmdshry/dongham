#!/bin/bash
set -euo pipefail
ROOT=/home/dongham/public_html
cd "$ROOT/apps/api"
# MYSQL_* and secrets: root .env wins over apps/api/.env (same order as local start).
args=()
if [ -f "$ROOT/apps/api/.env" ]; then
  args+=(--env-file="$ROOT/apps/api/.env")
fi
args+=(--env-file="$ROOT/.env")
exec /usr/local/bin/node "${args[@]}" dist/index.js
