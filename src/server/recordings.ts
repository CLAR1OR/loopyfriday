import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import {
  comments,
  projectMembers,
  recordings,
  sections,
  type RecordingStatus,
} from "@/server/db/schema";
import { storage } from "@/server/storage";

/** True if the user belongs to the project (single shared library for now). */
export async function userInProject(userId: string, projectId: string) {
  const row = await db.query.projectMembers.findFirst({
    where: and(
      eq(projectMembers.userId, userId),
      eq(projectMembers.projectId, projectId),
    ),
  });
  return Boolean(row);
}

export async function createRecording(opts: {
  projectId: string;
  uploadedBy: string;
  title: string;
  recordedOn?: string | null;
  jamSessionId?: string | null;
}) {
  const [rec] = await db
    .insert(recordings)
    .values({
      projectId: opts.projectId,
      uploadedBy: opts.uploadedBy,
      title: opts.title,
      recordedOn: opts.recordedOn ?? null,
      jamSessionId: opts.jamSessionId ?? null,
      status: "uploaded",
    })
    .returning();
  return rec;
}

/** Recordings in a project, newest first. */
export async function listRecordings(projectId: string) {
  return db.query.recordings.findMany({
    where: eq(recordings.projectId, projectId),
    orderBy: [desc(recordings.createdAt)],
  });
}

export async function getRecording(recordingId: string) {
  return db.query.recordings.findFirst({
    where: eq(recordings.id, recordingId),
  });
}

/** Fetch a recording only if the user may see it; null otherwise. */
export async function getRecordingForUser(recordingId: string, userId: string) {
  const rec = await getRecording(recordingId);
  if (!rec) return null;
  if (!(await userInProject(userId, rec.projectId))) return null;
  return rec;
}

/**
 * Called when the tus upload completes: record where the bytes landed and how
 * big they are. Only fills in a recording that is still awaiting its source.
 */
export async function attachUploadedFile(
  recordingId: string,
  data: {
    storageKey: string;
    mime?: string | null;
    sizeBytes?: number | null;
    originalFilename?: string | null;
  },
) {
  const [updated] = await db
    .update(recordings)
    .set({
      storageKey: data.storageKey,
      mime: data.mime ?? null,
      sizeBytes: data.sizeBytes ?? null,
      originalFilename: data.originalFilename ?? null,
    })
    .where(eq(recordings.id, recordingId))
    .returning();
  return updated ?? null;
}

export async function setRecordingStatus(
  recordingId: string,
  status: RecordingStatus,
) {
  await db
    .update(recordings)
    .set({ status })
    .where(eq(recordings.id, recordingId));
}

/** Reset a failed recording so the worker can have another go. */
export async function resetRecordingForReprocess(recordingId: string) {
  await db
    .update(recordings)
    .set({ status: "uploaded", error: null })
    .where(eq(recordings.id, recordingId));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Edit a recording's title and/or date. */
export async function updateRecordingMeta(
  recordingId: string,
  patch: { title?: string; recordedOn?: string | null },
) {
  const set: { title?: string; recordedOn?: string | null } = {};
  if (patch.title !== undefined) set.title = patch.title.trim() || "Untitled recording";
  if (patch.recordedOn !== undefined) {
    set.recordedOn =
      patch.recordedOn && DATE_RE.test(patch.recordedOn) ? patch.recordedOn : null;
  }
  if (Object.keys(set).length === 0) return;
  await db.update(recordings).set(set).where(eq(recordings.id, recordingId));
}

export interface RecordingCounts {
  sections: number;
  comments: number;
}

/**
 * Per-recording counts of sections and comments (recording-level + section-level,
 * excluding soft-deleted). Returns a map keyed by recording id.
 */
export async function getRecordingCounts(
  recordingIds: string[],
): Promise<Map<string, RecordingCounts>> {
  const result = new Map<string, RecordingCounts>();
  if (recordingIds.length === 0) return result;
  const get = (id: string) =>
    result.get(id) ?? result.set(id, { sections: 0, comments: 0 }).get(id)!;

  const sectionCounts = await db
    .select({ rid: sections.recordingId, c: count() })
    .from(sections)
    .where(inArray(sections.recordingId, recordingIds))
    .groupBy(sections.recordingId);
  for (const row of sectionCounts) get(row.rid).sections = row.c;

  const recComments = await db
    .select({ rid: comments.entityId, c: count() })
    .from(comments)
    .where(
      and(
        eq(comments.entityType, "recording"),
        inArray(comments.entityId, recordingIds),
        isNull(comments.deletedAt),
      ),
    )
    .groupBy(comments.entityId);
  for (const row of recComments) get(row.rid).comments += row.c;

  const secComments = await db
    .select({ rid: sections.recordingId, c: count() })
    .from(comments)
    .innerJoin(sections, eq(comments.entityId, sections.id))
    .where(
      and(
        eq(comments.entityType, "section"),
        inArray(sections.recordingId, recordingIds),
        isNull(comments.deletedAt),
      ),
    )
    .groupBy(sections.recordingId);
  for (const row of secComments) get(row.rid).comments += row.c;

  return result;
}

async function fileSize(key: string | null): Promise<number> {
  if (!key) return 0;
  try {
    return await storage.size(key);
  } catch {
    return 0;
  }
}

export interface RecordingStorage {
  id: string;
  title: string;
  status: RecordingStatus;
  hasVideo: boolean;
  hasOriginal: boolean;
  hasMedia: boolean;
  video: number;
  audio: number;
  original: number;
  peaks: number;
  total: number;
}

/** Per-recording on-disk media sizes, for the admin storage view. */
export async function getRecordingsStorage(
  projectId: string,
): Promise<RecordingStorage[]> {
  const recs = await listRecordings(projectId);
  const out: RecordingStorage[] = [];
  for (const r of recs) {
    const [video, audio, original, peaks] = await Promise.all([
      fileSize(r.videoKey),
      fileSize(r.streamKey),
      fileSize(r.storageKey),
      fileSize(r.peaksPath),
    ]);
    out.push({
      id: r.id,
      title: r.title,
      status: r.status,
      hasVideo: Boolean(r.videoKey),
      hasOriginal: Boolean(r.storageKey),
      hasMedia: Boolean(r.videoKey || r.streamKey || r.storageKey || r.peaksPath),
      video,
      audio,
      original,
      peaks,
      total: video + audio + original + peaks,
    });
  }
  return out;
}

/** Free the raw upload only, keeping the playable video derivative + audio.
 * The recording can no longer be reprocessed afterwards. */
export async function deleteRecordingOriginal(recordingId: string) {
  const rec = await getRecording(recordingId);
  if (!rec || !rec.storageKey) return;
  await storage.remove(rec.storageKey).catch(() => {});
  await db
    .update(recordings)
    .set({ storageKey: null })
    .where(eq(recordings.id, recordingId));
}

/** Free video space: remove the video derivative + the (video) original; keep
 * the audio stream + peaks so the waveform still works. */
export async function deleteRecordingVideo(recordingId: string) {
  const rec = await getRecording(recordingId);
  if (!rec) return;
  if (rec.videoKey) await storage.remove(rec.videoKey).catch(() => {});
  if (rec.storageKey) await storage.remove(rec.storageKey).catch(() => {});
  await db
    .update(recordings)
    .set({ videoKey: null, storageKey: null })
    .where(eq(recordings.id, recordingId));
}

/** Free all media: remove video, audio stream, peaks, and the original. The
 * recording row, its sections, and comments are kept. */
export async function deleteRecordingMedia(recordingId: string) {
  const rec = await getRecording(recordingId);
  if (!rec) return;
  for (const key of [rec.videoKey, rec.streamKey, rec.peaksPath, rec.storageKey]) {
    if (key) await storage.remove(key).catch(() => {});
  }
  await db
    .update(recordings)
    .set({ videoKey: null, streamKey: null, peaksPath: null, storageKey: null })
    .where(eq(recordings.id, recordingId));
}
