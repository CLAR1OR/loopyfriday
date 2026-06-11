"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { enqueueProcessRecording } from "@/server/queue";
import {
  createRecording,
  deleteRecordingMedia,
  deleteRecordingOriginal,
  deleteRecordingVideo,
  getRecording,
  getRecordingForUser,
  resetRecordingForReprocess,
  updateRecordingMeta,
} from "@/server/recordings";
import { addProjectMember, getOrCreateDefaultProject } from "@/server/projects";

/**
 * Create the recording row before the upload starts, so the client has an id to
 * attach as tus metadata and to navigate to. Returns the new recording id.
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function createRecordingAction(input: {
  title?: string;
  recordedOn?: string;
}): Promise<{ recordingId: string }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const project = await getOrCreateDefaultProject();
  // Self-heal membership so the upload's authorization check passes.
  await addProjectMember(project.id, user.id, "member");

  const title = input.title?.trim() || "Untitled recording";
  const recordedOn =
    input.recordedOn && DATE_RE.test(input.recordedOn)
      ? input.recordedOn
      : new Date().toISOString().slice(0, 10);

  const rec = await createRecording({
    projectId: project.id,
    uploadedBy: user.id,
    title,
    recordedOn,
  });
  return { recordingId: rec.id };
}

/** Re-queue processing for a recording whose transcode/peaks job failed. */
export async function retryRecordingAction(input: {
  recordingId: string;
}): Promise<{ ok: true }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const rec = await getRecordingForUser(input.recordingId, user.id);
  if (!rec) throw new Error("Forbidden");
  if (!rec.storageKey) throw new Error("This recording has no uploaded source.");

  await resetRecordingForReprocess(rec.id);
  await enqueueProcessRecording(rec.id);
  revalidatePath(`/recordings/${rec.id}`);
  return { ok: true };
}

/** Edit a recording's name and/or date (any member). */
export async function updateRecordingAction(input: {
  recordingId: string;
  title?: string;
  recordedOn?: string;
}): Promise<{ ok: true }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  const rec = await getRecordingForUser(input.recordingId, user.id);
  if (!rec) throw new Error("Forbidden");

  await updateRecordingMeta(input.recordingId, {
    title: input.title,
    recordedOn: input.recordedOn,
  });
  revalidatePath(`/recordings/${input.recordingId}`);
  revalidatePath("/sessions");
  return { ok: true };
}

async function assertAdmin(recordingId: string) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") throw new Error("Forbidden");
  const rec = await getRecording(recordingId);
  if (!rec) throw new Error("Not found");
  return rec;
}

/** Admin: free the raw upload only (keeps video + audio playable). */
export async function deleteRecordingOriginalAction(input: {
  recordingId: string;
}): Promise<{ ok: true }> {
  await assertAdmin(input.recordingId);
  await deleteRecordingOriginal(input.recordingId);
  revalidatePath("/admin/storage");
  revalidatePath(`/recordings/${input.recordingId}`);
  return { ok: true };
}

/** Admin: free video space (keeps the audio + waveform). */
export async function deleteRecordingVideoAction(input: {
  recordingId: string;
}): Promise<{ ok: true }> {
  await assertAdmin(input.recordingId);
  await deleteRecordingVideo(input.recordingId);
  revalidatePath("/admin/storage");
  revalidatePath(`/recordings/${input.recordingId}`);
  return { ok: true };
}

/** Admin: free all media for a recording (keeps tags/comments). */
export async function deleteRecordingMediaAction(input: {
  recordingId: string;
}): Promise<{ ok: true }> {
  await assertAdmin(input.recordingId);
  await deleteRecordingMedia(input.recordingId);
  revalidatePath("/admin/storage");
  revalidatePath(`/recordings/${input.recordingId}`);
  return { ok: true };
}
