# LoopyFriday

A private, self-hosted web app for making music with friends: upload jam-session
recordings, tag sections of them on a waveform, and maintain per-song workspaces
for lyrics (ChordPro), scores, and audio.

See [PLAN.md](./PLAN.md) for the full design and the phased build.

## Stack

Next.js 16 (App Router, TS) · Tailwind v4 + shadcn/ui · PostgreSQL + Drizzle ORM ·
Better Auth (credentials + admin, DB sessions) · pg-boss job queue (on Postgres,
no Redis) · tus resumable uploads · ffmpeg (transcode + waveform peaks) ·
wavesurfer.js v7 · chordsheetjs.

Ships as docker-compose: `app` + `postgres` + `worker` (the worker reuses the app
image with a different entrypoint), sharing a files volume and exposing one HTTP
port for a reverse proxy (e.g. Nginx Proxy Manager).

## Local development

Requires Node 22, ffmpeg/ffprobe on PATH, and a Postgres instance.

```bash
cp .env.example .env          # then edit secrets
npm install
npm run db:migrate            # apply migrations
npm run seed                  # create the admin + default project
npm run dev                   # Next dev server on :3000
npm run worker:dev            # background job worker (separate terminal)
```

Useful scripts: `db:generate` (generate a migration from schema changes),
`db:push` (push schema directly, dev only), `build`, `start`, `lint`.

## Running with Docker

```bash
cp .env.example .env          # set BETTER_AUTH_SECRET at minimum
docker compose up --build
```

This starts Postgres, the app (which runs migrations on boot), and the worker.
To seed the initial admin once the stack is up:

```bash
docker compose run --rm app seed
```

The app is served on `http://localhost:3000` (override with `APP_PORT`).

## Operations

### Behind a reverse proxy (Nginx Proxy Manager)

Uploads are resumable (tus) and can be large, so on the proxy host:

- raise `client_max_body_size` (e.g. `2g`, matching `UPLOAD_MAX_BYTES`);
- disable request buffering (`proxy_request_buffering off;`) so chunks stream
  through;
- allow long timeouts (`proxy_read_timeout` / `proxy_send_timeout`);
- pass Range requests through untouched (default) so audio seeking works.

Test a real large upload **through the proxy**, not just on localhost.

### Limits & storage

- `UPLOAD_MAX_BYTES` caps a single recording upload (default 2 GiB); score
  uploads are capped at 25 MB.
- `STORAGE_DRIVER=local` (default) stores files under the `files` volume. `s3`
  is a stub (`src/server/storage/s3.ts`) — implement it to use S3/MinIO.

### Failed jobs

If transcoding/peaks fail, the recording shows **Processing failed** with the
error and a **Retry** button (re-queues the idempotent worker job). pg-boss also
retries transient failures automatically; a worker killed mid-job picks the job
back up on restart.

### Backup & restore

Back up the database **and** the files volume together (the DB references
storage keys):

```bash
./scripts/backup.sh            # -> backups/<timestamp>/{db.sql.gz, files.tar.gz}
```

Restore into a running (ideally freshly migrated) stack:

```bash
docker compose up -d                       # fresh stack; migrations run on boot
./scripts/restore.sh backups/<timestamp>   # loads DB + files
docker compose restart app worker
```

Originals are kept, so transcoded streams and waveform peaks can be regenerated
(each recording carries a `peaks_version`).
