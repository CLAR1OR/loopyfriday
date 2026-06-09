#!/usr/bin/env bash
#
# Back up LoopyFriday: a Postgres dump + a snapshot of the files volume.
# Run from the repo root with the stack up:  ./scripts/backup.sh [OUTPUT_DIR]
#
# Produces OUTPUT_DIR/<timestamp>/{db.sql.gz, files.tar.gz}. Keep both together:
# the DB references storage keys that must exist in the files volume. Originals
# are kept, so streams/peaks can be regenerated if needed (peaks_version).
set -euo pipefail

OUT_DIR="${1:-backups}"
TS="$(date +%Y%m%d-%H%M%S)"
DEST="$OUT_DIR/$TS"
mkdir -p "$DEST"

PGUSER="${POSTGRES_USER:-loopy}"
PGDB="${POSTGRES_DB:-loopyfriday}"

echo "[backup] Postgres -> $DEST/db.sql.gz"
docker compose exec -T postgres \
  pg_dump --clean --if-exists --no-owner --no-acl -U "$PGUSER" -d "$PGDB" \
  | gzip >"$DEST/db.sql.gz"

echo "[backup] files volume -> $DEST/files.tar.gz"
# Mount the files volume (via the app service) and tar it from a throwaway
# container; --entrypoint sh bypasses the role-based entrypoint.
docker compose run --rm --no-deps -T \
  --entrypoint sh \
  -v "$(pwd)/$DEST:/backup" \
  app -c 'tar czf /backup/files.tar.gz -C /data files'

echo "[backup] done: $DEST"
ls -lh "$DEST"
