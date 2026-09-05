#!/bin/bash
set -euo pipefail
ROOT=/home/dongham/public_html
cd "$ROOT/apps/api"
# MYSQL_* and secrets: root .env wins over apps/api/.env (same order as local start).
exec /usr/local/bin/node --env-file="$ROOT/apps/api/.env" --env-file="$ROOT/.env" dist/index.js
