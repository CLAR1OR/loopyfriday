"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { getRecordingForUser } from "@/server/recordings";
import {
  addLyricVersion,
  addSongAudio,
  getLyricVersion,
  getSongAudio,
  getSongForUser,
  listSongAudios,
  promoteSection,
  removeSongAudio,
  updateSong,
  updateSongAudioTitle,
  type SongAudio,
} from "@/server/songs";

async function requireUserId() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  return user.id;
}

export async function promoteSectionToSongAction(input: {
  sectionId: string;
}): Promise<{ songId: string }> {
  const userId = await requireUserId();
  const songId = await promoteSection(input.sectionId, userId);
  revalidatePath("/songs");
  return { songId };
}

export async function saveLyricsAction(input: {
  songId: string;
  content: string;
  message?: string;
}): Promise<{ ok: true; versionId: string }> {
  const userId = await requireUserId();
  const song = await getSongForUser(input.songId, userId);
  if (!song) throw new Error("Forbidden");

  const version = await addLyricVersion({
    songId: input.songId,
    authorId: userId,
    content: input.content,
    message: input.message?.trim() || null,
  });
  revalidatePath(`/songs/${input.songId}`);
  return { ok: true, versionId: version.id };
}

export async function restoreVersionAction(input: {
  songId: string;
  versionId: string;
}): Promise<{ ok: true; versionId: string }> {
  const userId = await requireUserId();
  const song = await getSongForUser(input.songId, userId);
  if (!song) throw new Error("Forbidden");

  const source = await getLyricVersion(input.versionId);
  if (!source || source.songId !== input.songId) {
    throw new Error("Version not found");
  }

  // Append-only restore: a new version carrying the old content.
  const version = await addLyricVersion({
    songId: input.songId,
    authorId: userId,
    content: source.content,
    message: "Restored an earlier version",
  });
  revalidatePath(`/songs/${input.songId}`);
  return { ok: true, versionId: version.id };
}

export async function updateSongAction(input: {
  songId: string;
  title?: string;
  status?: "idea" | "wip" | "done";
}): Promise<{ ok: true }> {
  const userId = await requireUserId();
  const song = await getSongForUser(input.songId, userId);
  if (!song) throw new Error("Forbidden");

  const patch: { title?: string; status?: "idea" | "wip" | "done" } = {};
  if (input.title !== undefined) patch.title = input.title.trim() || "Untitled song";
  if (input.status !== undefined) patch.status = input.status;
  await updateSong(input.songId, patch);

  revalidatePath(`/songs/${input.songId}`);
  revalidatePath("/songs");
  return { ok: true };
}

/* ---------------------------------------------------------------- */
/* Song audios (titled takes, e.g. ver1 / ver2)                      */
/* ---------------------------------------------------------------- */

export async function addSongAudioAction(input: {
  songId: string;
  recordingId: string;
  title?: string;
}): Promise<SongAudio[]> {
  const userId = await requireUserId();
  const song = await getSongForUser(input.songId, userId);
  if (!song) throw new Error("Forbidden");
  const rec = await getRecordingForUser(input.recordingId, userId);
  if (!rec || rec.projectId !== song.projectId) throw new Error("Forbidden");

  await addSongAudio({
    songId: input.songId,
    recordingId: input.recordingId,
    title: input.title?.trim() || rec.title,
  });
  revalidatePath(`/songs/${input.songId}`);
  return listSongAudios(input.songId);
}

async function songAudioAccess(songAudioId: string, userId: string) {
  const audio = await getSongAudio(songAudioId);
  if (!audio) throw new Error("Not found");
  const song = await getSongForUser(audio.songId, userId);
  if (!song) throw new Error("Forbidden");
  return audio.songId;
}

export async function renameSongAudioAction(input: {
  songAudioId: string;
  title: string;
}): Promise<{ ok: true }> {
  const userId = await requireUserId();
  const songId = await songAudioAccess(input.songAudioId, userId);
  await updateSongAudioTitle(input.songAudioId, input.title.trim() || "Untitled");
  revalidatePath(`/songs/${songId}`);
  return { ok: true };
}

export async function removeSongAudioAction(input: {
  songAudioId: string;
}): Promise<{ ok: true }> {
  const userId = await requireUserId();
  const songId = await songAudioAccess(input.songAudioId, userId);
  await removeSongAudio(input.songAudioId);
  revalidatePath(`/songs/${songId}`);
  return { ok: true };
}
