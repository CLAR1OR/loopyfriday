#!/usr/bin/env bash
set -euo pipefail

role="${1:-app}"

case "$role" in
  app)
    echo "[entrypoint] running database migrations..."
    npm run db:migrate
    echo "[entrypoint] starting Next.js server..."
    exec npm run start -- --hostname 0.0.0.0 --port 3000
    ;;
  worker)
    echo "[entrypoint] starting background worker..."
    exec npm run worker
    ;;
  seed)
    echo "[entrypoint] seeding initial admin + default project..."
    exec npm run seed
    ;;
  *)
    echo "[entrypoint] unknown role: $role" >&2
    exit 1
    ;;
esac
