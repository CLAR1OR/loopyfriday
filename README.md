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

The app is served on `http://localhost:3000` (override with `APP_PORT`). Behind a
reverse proxy, raise the client body-size limit and disable upload buffering so
large resumable uploads pass through (see PLAN.md → Key risks).
