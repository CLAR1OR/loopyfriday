#!/usr/bin/env bash
#
# Restore a LoopyFriday backup into the running stack (ideally a clean one).
# Usage from the repo root:  ./scripts/restore.sh <backup_dir>
# where <backup_dir> contains db.sql.gz and files.tar.gz (see backup.sh).
#
# The DB dump was taken with --clean --if-exists, so it drops and recreates
# objects; restoring over a freshly migrated database is fine.
set -euo pipefail

SRC="${1:?usage: ./scripts/restore.sh <backup_dir>}"
[ -f "$SRC/db.sql.gz" ] || { echo "missing $SRC/db.sql.gz" >&2; exit 1; }
[ -f "$SRC/files.tar.gz" ] || { echo "missing $SRC/files.tar.gz" >&2; exit 1; }

PGUSER="${POSTGRES_USER:-loopy}"
PGDB="${POSTGRES_DB:-loopyfriday}"

echo "[restore] loading $SRC/db.sql.gz into Postgres"
gunzip -c "$SRC/db.sql.gz" \
  | docker compose exec -T postgres psql -v ON_ERROR_STOP=0 -U "$PGUSER" -d "$PGDB" >/dev/null

echo "[restore] restoring files volume from $SRC/files.tar.gz"
docker compose run --rm --no-deps -T \
  --entrypoint sh \
  -v "$(pwd)/$SRC:/backup" \
  app -c 'rm -rf /data/files/* /data/files/.[!.]* 2>/dev/null; tar xzf /backup/files.tar.gz -C /data'

echo "[restore] done. Restart the app if it was running: docker compose restart app worker"
