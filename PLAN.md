# LoopyFriday — Private Music Collaboration Platform

## Context

The user makes music with friends and wants a private, self-hosted web app to (1) upload jam-session recordings and tag sections of them, and (2) maintain per-song workspaces for lyrics/scores/audio. It will run via Docker behind the user's existing Nginx Proxy Manager (NPM) on their domain. The repo is a greenfield build.

Requirements were pinned down in a detailed interview:

- **Jam Sessions (priority):** upload audio → render waveform → drag-select time ranges into named "sections," each with optional lyrics + uploaded score files. A section can be promoted into a Song (lyrics copied, audio/scores referenced).
- **Songs:** per-song page with a ChordPro lyrics editor (chords-over-words, verse/chorus/bridge structure), version history, plus attached audio and score (PDF/image) files.
- **Comments:** threaded, on songs / recordings / sections.
- **Auth:** individual accounts, admin-created/invite-only (no open signup), session-based, no email server (invite links/codes; admin-driven password resets).
- **Collaboration:** simple save + version history (no real-time co-editing).
- **Sheet music v1:** upload-only; in-app notation editor deferred (data model leaves room).
- **Organization:** one shared library now, but data model supports multiple bands/projects later.
- **Audio:** mixed short clips + long full sessions (30–90+ min) → resumable uploads + smooth seeking.
- **Device:** desktop-first, mobile kept usable. Scale: small but "could grow."

## Stack (user delegated the choice)

Next.js 15 (App Router, TS) + Tailwind + shadcn/ui · PostgreSQL + Drizzle ORM · Better Auth (credentials + admin plugin, DB sessions; Lucia is deprecated) · pg-boss job queue (on Postgres — no Redis) · tus resumable uploads · ffmpeg + BBC audiowaveform (baked into the image) · wavesurfer.js v7 + Regions plugin · chordsheetjs for ChordPro. Ships as docker-compose: app + postgres + worker (same image, worker entrypoint) sharing a files volume; one HTTP port for NPM.

## Data model (Drizzle schema, Postgres)

Every table has id/created_at/updated_at. Multi-project via a projects table with a seeded default project; content carries project_id NOT NULL. Polymorphic links use (entity_type, entity_id).

- **Auth (Better Auth-managed):** users (incl. role: admin|member), accounts (password hash), auth_sessions, verifications.
- **Tenancy/invites:** projects, project_members (project_id,user_id,role), invites (token, role, project_id?, expires_at, accepted_at/by).
- **Recordings:** sessions (jam grouping), recordings (project_id, session_id?, uploaded_by, title, storage_key, stream_key, peaks_path, peaks_version, duration_seconds, mime, size_bytes, status: uploaded|processing|ready|failed, error).
- **Sections:** sections (recording_id, name, start_seconds, end_seconds, sort_order, lyrics?, color, promoted_song_id?).
- **Songs:** songs (project_id, title, status, current_lyric_version_id?, origin_section_id?, origin_recording_id?), lyric_versions (song_id, author_id, content[ChordPro], message?, created_at) — append-only = history.
- **Files:** files (kind: audio_original|audio_stream|peaks|score_pdf|score_image, storage_provider, storage_key, mime, size_bytes); attachments (file_id, entity_type: song|section|recording|comment, entity_id, role) — lets a score attach to a section and travel to a song on promotion without copying bytes.
- **Comments:** comments (project_id, author_id, entity_type, entity_id, parent_id?, body, deleted_at?).

Indexes on sections(recording_id,start_seconds), comments(entity_type,entity_id,parent_id), attachments(entity_type,entity_id), lyric_versions(song_id,created_at), invites(token), auth_sessions(token).

**Promotion (section→song):** create song with origin_*; copy sections.lyrics into first lyric_versions row; add new attachments rows pointing at the same file_ids (no byte duplication); set current_lyric_version_id and sections.promoted_song_id.

## Repo structure

```
docker-compose.yml · Dockerfile (multi-stage; bakes ffmpeg + audiowaveform) · drizzle.config.ts · .env.example
src/app/            (auth)/login, /invite/[token] · (app)/sessions,/recordings/[id],/songs/[id],/admin
src/app/api/        upload/[...tus] · stream/[fileId] · peaks/[recordingId] · auth/[...all]
src/server/         db/(schema,client,migrations) · auth/ · queue/(pg-boss) · storage/(local; s3 later) · media/(ffmpeg,audiowaveform) · services/
src/components/      wavesurfer player+regions · chordpro editor · comments
src/lib/             chordpro (chordsheetjs), peaks normalization
src/worker/          pg-boss consumers: transcode, peaks
scripts/             seed-admin, seed-default-project, backup/restore
data/ (gitignored)   pgdata, files/{originals,streams,peaks,scores}
```

## Phased build (priority feature demoable early)

**Phase 0 — Scaffolding & Docker.** Next.js+TS+Tailwind+shadcn; compose with app/postgres/worker + volumes; multi-stage Dockerfile baking pinned ffmpeg + audiowaveform; Drizzle wired with migrations-on-boot; healthchecks. *Verify:* docker compose up serves a page; worker runs ffmpeg -version & audiowaveform --version.

**Phase 1 — Auth & shell.** Better Auth (credentials + admin + DB sessions), signup disabled; seed admin from env; login/logout; protected layout; admin screens (create user / generate invite link / set password); seed default project. *Verify:* admin creates member + invite link; member registers via link; open signup impossible; admin password reset works; no emails sent.

**Phase 2 — PRIORITY: upload + waveform + section tagging.** tus endpoint (nodejs runtime, body-parse bypassed) + Uppy/tus-js-client (progress/resume) → recordings. Worker pg-boss jobs: ffmpeg transcode (AAC +faststart) and audiowaveform peaks → status=ready. Streaming endpoint with HTTP Range/206 (auth-checked; offload to NPM via X-Accel-Redirect as an optimization). Recording page: wavesurfer v7 + Regions → drag-select creates sections (name + inline lyrics), list/edit/delete, seek-to-section. *Verify:* resume a 60-min upload over a flaky link; waveform paints instantly from precomputed peaks; region persists across reload; clicking a section seeks correctly.

**Phase 3 — Promotion + Songs workspace.** "Promote to Song" per the data-model flow. Song page: ChordPro editor with live chordsheetjs preview + verse/chorus/bridge; save → new lyric_version; history with diff + restore; attached audio + scores. *Verify:* promotion carries lyrics/audio/scores; edits create versions; restore works; chords render over lyrics.

**Phase 4 — Comments + score uploads.** Threaded comments on song/recording/section (section comments shown near their region); PDF/image score upload + viewer attachable to sections/songs. *Verify:* comment+reply + soft-delete on each entity; score attached to a section travels on promotion.

**Phase 5 — Polish, mobile, ops.** Mobile-usable layouts; surface failed jobs + retry; upload limits; documented backup (pg_dump + consistent files-volume snapshot) and restore; S3/MinIO storage-driver stub. *Verify:* core flows usable on a phone; kill worker mid-job → retries; restore into a clean stack.

## Key risks & mitigations

- **Big uploads via Next time out** → tus on a nodejs route, body parsing bypassed; raise NPM client_max_body_size, disable proxy request buffering, generous timeouts; test a real >1 GB upload.
- **ffmpeg/audiowaveform missing/skewed** → baked into image at pinned versions with a startup self-check; heavy work only in the worker.
- **Seeking broken** → correct 206 (Accept-Ranges/Content-Range/sliced Content-Length) or X-Accel-Redirect; transcode +faststart; verify Safari + Chrome.
- **wavesurfer peaks flat/clipped** → normalize audiowaveform ints (−128..127 → −1..1, ÷128) in the peaks API; pass duration so the client doesn't decode.
- **Backups** → back up pg_dump AND files volume consistently; keep originals so streams/peaks can be regenerated (peaks_version).
- **Queue at-least-once** → idempotent jobs (deterministic output keys; check status before reprocessing).

## End-to-end verification

After Phase 2, the priority loop is demoable via docker compose up behind NPM: log in as an invited member → upload a long jam recording (resumable) → waveform renders → drag-select and name sections with lyrics → reload and seek. Later phases verified per their Verify notes above. NPM config (large body size, no upload buffering, range pass-through) must be tested through the proxy, not just localhost.
