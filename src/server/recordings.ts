import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import {
  projectMembers,
  recordings,
  type RecordingStatus,
} from "@/server/db/schema";

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
