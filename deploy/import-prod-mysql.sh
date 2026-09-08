#!/bin/bash
# JSON file store → MySQL tables on the production host.
# Run from the deployed repo as user dongham. Does not change JWT_SECRET.
set -euo pipefail

ROOT="${DONGHAM_ROOT:-/home/dongham/public_html}"
STORE="${STORE_JSON:-$ROOT/apps/api/data/store.json}"
BACKUP_ROOT="${BACKUP_ROOT:-/home/dongham/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$BACKUP_ROOT/dongham-store-$STAMP"
ENV_FILE="$ROOT/.env"
API_DIR="$ROOT/apps/api"

DO_BACKUP=0
DO_FREEZE=0
DO_CHECK_ENV=0
DO_IMPORT=0
DO_CUTOVER=0
FORCE_IMPORT=0

usage() {
  cat <<EOF
Usage: deploy/import-prod-mysql.sh [--all] [--backup] [--freeze] [--check-env] [--import] [--force] [--cutover]

  --backup      Copy the legacy store.json before the one-time MySQL import
  --freeze      pm2 stop dongham-api, then take a final store.json copy
  --check-env   Require MYSQL_* and JWT_SECRET in $ENV_FILE (does not rewrite secrets)
  --import      pnpm migrate + import-store into MYSQL_DATABASE
  --force       Replace existing MySQL rows
  --cutover     pm2 start/restart with deploy/ecosystem.config.cjs
  --all         backup + freeze + check-env + import (not cutover)

Environment: DONGHAM_ROOT, STORE_JSON, BACKUP_ROOT
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --backup) DO_BACKUP=1 ;;
    --freeze) DO_FREEZE=1 ;;
    --check-env) DO_CHECK_ENV=1 ;;
    --import) DO_IMPORT=1 ;;
    --force) FORCE_IMPORT=1 ;;
    --cutover) DO_CUTOVER=1 ;;
    --all)
      DO_BACKUP=1
      DO_FREEZE=1
      DO_CHECK_ENV=1
      DO_IMPORT=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown flag: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if [ "$DO_BACKUP" -eq 0 ] && [ "$DO_FREEZE" -eq 0 ] && [ "$DO_CHECK_ENV" -eq 0 ] && [ "$DO_IMPORT" -eq 0 ] && [ "$DO_CUTOVER" -eq 0 ]; then
  usage >&2
  exit 1
fi

env_get() {
  local key="$1"
  [ -f "$ENV_FILE" ] || return 0
  awk -F= -v k="$key" '
    $1 == k {
      sub(/^[^=]*=/, "")
      gsub(/\r/, "")
      if ($0 ~ /^".*"$/ || $0 ~ /^'\''.*'\''$/) { $0 = substr($0, 2, length($0) - 2) }
      print
      exit
    }
  ' "$ENV_FILE"
}

copy_store() {
  local dest="$1"
  mkdir -p "$dest"
  if [ ! -f "$STORE" ]; then
    echo "store.json missing: $STORE" >&2
    exit 1
  fi
  cp -a "$STORE" "$dest/store.json"
  echo "copied $STORE → $dest/store.json ($(wc -c < "$STORE") bytes)"
}

if [ "$DO_BACKUP" -eq 1 ]; then
  echo "== backup (API still running) =="
  copy_store "$BACKUP_DIR"
fi

if [ "$DO_FREEZE" -eq 1 ]; then
  echo "== freeze writes =="
  if command -v pm2 >/dev/null 2>&1; then
    pm2 stop dongham-api || true
  else
    echo "warn: pm2 not on PATH; stop the API yourself before relying on this copy" >&2
  fi
  copy_store "${BACKUP_DIR}-final"
  STORE="${BACKUP_DIR}-final/store.json"
fi

if [ "$DO_CHECK_ENV" -eq 1 ]; then
  echo "== check MYSQL_* / JWT_SECRET =="
  if [ ! -f "$ENV_FILE" ]; then
    echo "missing $ENV_FILE" >&2
    exit 1
  fi
  missing=0
  for key in MYSQL_HOST MYSQL_USER MYSQL_DATABASE JWT_SECRET; do
    if [ -z "$(env_get "$key")" ]; then
      echo "missing $key in $ENV_FILE" >&2
      missing=1
    fi
  done
  if [ "$missing" -ne 0 ]; then
    echo "add MYSQL_HOST MYSQL_PORT MYSQL_USER MYSQL_PASSWORD MYSQL_DATABASE without changing JWT_SECRET" >&2
    exit 1
  fi
  echo "MYSQL_HOST=$(env_get MYSQL_HOST) MYSQL_DATABASE=$(env_get MYSQL_DATABASE) JWT_SECRET=set"
  if [ -z "$(env_get ENCRYPTION_KEY || true)" ]; then
    echo "note: ENCRYPTION_KEY unset; API will fall back to JWT_SECRET for AES"
  fi
fi

if [ "$DO_IMPORT" -eq 1 ]; then
  echo "== import store → MySQL =="
  if [ ! -d "$API_DIR" ]; then
    echo "missing $API_DIR (deploy this branch first)" >&2
    exit 1
  fi
  IMPORT_FILE="$STORE"
  if [ -f "${BACKUP_DIR}-final/store.json" ]; then
    IMPORT_FILE="${BACKUP_DIR}-final/store.json"
  elif [ -f "$BACKUP_DIR/store.json" ]; then
    IMPORT_FILE="$BACKUP_DIR/store.json"
  fi
  cd "$ROOT"
  extra=()
  if [ "$FORCE_IMPORT" -eq 1 ]; then
    extra+=(--force)
  fi
  pnpm --filter @dongham/api migrate
  pnpm --filter @dongham/api import-store -- "$IMPORT_FILE" "${extra[@]}"
  echo "import finished from $IMPORT_FILE"
  echo "smoke-check login / a period / an expense, then rerun with --cutover"
fi

if [ "$DO_CUTOVER" -eq 1 ]; then
  echo "== cutover PM2 =="
  if [ ! -x "$ROOT/deploy/start-prod.sh" ]; then
    echo "missing executable $ROOT/deploy/start-prod.sh" >&2
    exit 1
  fi
  cd "$ROOT"
  pm2 startOrReload "$ROOT/deploy/ecosystem.config.cjs" --update-env
  pm2 save
  echo "PM2 now runs deploy/start-prod.sh (MySQL). Keep $BACKUP_ROOT copies for rollback."
fi
