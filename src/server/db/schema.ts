/**
 * Drizzle schema for LoopyFriday.
 *
 * Two groups of tables:
 *  1. Better Auth tables (`user`, `session`, `account`, `verification`). Their
 *     *property keys* must match Better Auth's field names exactly; the DB
 *     column names are free (we use snake_case). These are wired into Better
 *     Auth via the drizzle adapter in `src/server/auth/index.ts`.
 *  2. Application tables (projects, recordings, sections, songs, ...).
 *
 * Cross-links that would form FK cycles (song <-> section <-> lyric_version)
 * are stored as plain id columns (no DB-level FK) and documented inline.
 */
import { nanoid } from "nanoid";
import {
  boolean,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => nanoid());

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* ------------------------------------------------------------------ */
/* Better Auth tables                                                  */
/* ------------------------------------------------------------------ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  // admin plugin fields
  role: text("role").$type<"admin" | "member">().default("member"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/* ------------------------------------------------------------------ */
/* Tenancy: projects, members, invites                                 */
/* ------------------------------------------------------------------ */

export const projects = pgTable("projects", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdBy: text("created_by").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const projectMembers = pgTable(
  "project_members",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").$type<"admin" | "member">().notNull().default("member"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("project_members_unique").on(t.projectId, t.userId),
    index("project_members_user_idx").on(t.userId),
  ],
);

export const invites = pgTable(
  "invites",
  {
    id: id(),
    token: text("token").notNull().unique(),
    email: text("email"),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    role: text("role").$type<"admin" | "member">().notNull().default("member"),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedBy: text("accepted_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => [index("invites_token_idx").on(t.token)],
);

/* ------------------------------------------------------------------ */
/* Recordings + sections                                               */
/* ------------------------------------------------------------------ */

export const jamSessions = pgTable(
  "jam_sessions",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    date: timestamp("date", { withTimezone: true }),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("jam_sessions_project_idx").on(t.projectId)],
);

export type RecordingStatus = "uploaded" | "processing" | "ready" | "failed";

export const recordings = pgTable(
  "recordings",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    jamSessionId: text("jam_session_id").references(() => jamSessions.id, {
      onDelete: "set null",
    }),
    uploadedBy: text("uploaded_by").references(() => user.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    originalFilename: text("original_filename"),
    // storage keys (relative paths within DATA_DIR)
    storageKey: text("storage_key"), // original upload
    streamKey: text("stream_key"), // transcoded web-friendly audio copy
    videoKey: text("video_key"), // web-playable video derivative (null = audio-only)
    peaksPath: text("peaks_path"), // precomputed waveform peaks json
    peaksVersion: integer("peaks_version").default(0),
    durationSeconds: real("duration_seconds"),
    sampleRate: integer("sample_rate"),
    mime: text("mime"),
    sizeBytes: integer("size_bytes"),
    status: text("status").$type<RecordingStatus>().notNull().default("uploaded"),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("recordings_project_idx").on(t.projectId),
    index("recordings_session_idx").on(t.jamSessionId),
    index("recordings_status_idx").on(t.status),
  ],
);

export const sections = pgTable(
  "sections",
  {
    id: id(),
    recordingId: text("recording_id")
      .notNull()
      .references(() => recordings.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    startSeconds: real("start_seconds").notNull(),
    endSeconds: real("end_seconds").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    lyrics: text("lyrics"),
    color: text("color"),
    // logical link to a promoted song (no FK to avoid a cycle with songs)
    promotedSongId: text("promoted_song_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sections_recording_start_idx").on(t.recordingId, t.startSeconds)],
);

/* ------------------------------------------------------------------ */
/* Songs + lyric versions                                              */
/* ------------------------------------------------------------------ */

export type SongStatus = "idea" | "wip" | "done";

export const songs = pgTable(
  "songs",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    status: text("status").$type<SongStatus>().notNull().default("idea"),
    // logical links (no FK to avoid cycles)
    currentLyricVersionId: text("current_lyric_version_id"),
    originSectionId: text("origin_section_id"),
    originRecordingId: text("origin_recording_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("songs_project_idx").on(t.projectId)],
);

export const lyricVersions = pgTable(
  "lyric_versions",
  {
    id: id(),
    songId: text("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, {
      onDelete: "set null",
    }),
    content: text("content").notNull().default(""), // ChordPro source
    message: text("message"),
    createdAt: createdAt(),
  },
  (t) => [index("lyric_versions_song_idx").on(t.songId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Files + polymorphic attachments                                     */
/* ------------------------------------------------------------------ */

export type FileKind =
  | "audio_original"
  | "audio_stream"
  | "peaks"
  | "score_pdf"
  | "score_image"
  | "other";

export const files = pgTable("files", {
  id: id(),
  projectId: text("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  uploadedBy: text("uploaded_by").references(() => user.id, {
    onDelete: "set null",
  }),
  kind: text("kind").$type<FileKind>().notNull().default("other"),
  storageProvider: text("storage_provider")
    .$type<"local" | "s3">()
    .notNull()
    .default("local"),
  storageKey: text("storage_key").notNull(),
  filename: text("filename"),
  mime: text("mime"),
  sizeBytes: integer("size_bytes"),
  checksum: text("checksum"),
  createdAt: createdAt(),
});

export type AttachmentEntity = "song" | "section" | "recording" | "comment";

export const attachments = pgTable(
  "attachments",
  {
    id: id(),
    fileId: text("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    entityType: text("entity_type").$type<AttachmentEntity>().notNull(),
    entityId: text("entity_id").notNull(),
    role: text("role"), // e.g. "score", "audio"
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("attachments_entity_idx").on(t.entityType, t.entityId)],
);

/* ------------------------------------------------------------------ */
/* Comments (threaded, polymorphic)                                    */
/* ------------------------------------------------------------------ */

export type CommentEntity = "song" | "recording" | "section";

export const comments = pgTable(
  "comments",
  {
    id: id(),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    authorId: text("author_id").references(() => user.id, {
      onDelete: "set null",
    }),
    entityType: text("entity_type").$type<CommentEntity>().notNull(),
    entityId: text("entity_id").notNull(),
    parentId: text("parent_id"),
    body: text("body").notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("comments_entity_idx").on(t.entityType, t.entityId, t.parentId),
  ],
);
