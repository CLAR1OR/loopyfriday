"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import {
  addLyricVersion,
  getLyricVersion,
  getSongForUser,
  promoteSection,
  updateSong,
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
