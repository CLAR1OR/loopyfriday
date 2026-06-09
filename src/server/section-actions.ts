"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { getRecordingForUser } from "@/server/recordings";
import {
  createSection,
  deleteSection,
  getSection,
  updateSection,
} from "@/server/sections";

export interface SectionDTO {
  id: string;
  name: string;
  startSeconds: number;
  endSeconds: number;
  lyrics: string | null;
  color: string | null;
  promotedSongId: string | null;
}

async function requireUserId() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  return user.id;
}

/** Verify the signed-in user may edit this section; returns its recordingId. */
async function assertSectionAccess(sectionId: string, userId: string) {
  const section = await getSection(sectionId);
  if (!section) throw new Error("Section not found");
  const rec = await getRecordingForUser(section.recordingId, userId);
  if (!rec) throw new Error("Forbidden");
  return section.recordingId;
}

export async function createSectionAction(input: {
  recordingId: string;
  name: string;
  startSeconds: number;
  endSeconds: number;
  lyrics?: string | null;
  color?: string | null;
}): Promise<SectionDTO> {
  const userId = await requireUserId();
  const rec = await getRecordingForUser(input.recordingId, userId);
  if (!rec) throw new Error("Forbidden");

  const start = Math.max(0, Number(input.startSeconds) || 0);
  const end = Math.max(start + 0.01, Number(input.endSeconds) || start);
  const name = input.name?.trim() || "Untitled section";

  const section = await createSection({
    recordingId: input.recordingId,
    createdBy: userId,
    name,
    startSeconds: start,
    endSeconds: end,
    lyrics: input.lyrics ?? null,
    color: input.color ?? null,
  });

  revalidatePath(`/recordings/${input.recordingId}`);
  return {
    id: section.id,
    name: section.name,
    startSeconds: section.startSeconds,
    endSeconds: section.endSeconds,
    lyrics: section.lyrics,
    color: section.color,
    promotedSongId: section.promotedSongId,
  };
}

export async function updateSectionAction(input: {
  sectionId: string;
  name?: string;
  startSeconds?: number;
  endSeconds?: number;
  lyrics?: string | null;
  color?: string | null;
}): Promise<{ ok: true }> {
  const userId = await requireUserId();
  const recordingId = await assertSectionAccess(input.sectionId, userId);

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim() || "Untitled section";
  if (input.startSeconds !== undefined)
    patch.startSeconds = Math.max(0, Number(input.startSeconds) || 0);
  if (input.endSeconds !== undefined)
    patch.endSeconds = Number(input.endSeconds) || 0;
  if (input.lyrics !== undefined) patch.lyrics = input.lyrics;
  if (input.color !== undefined) patch.color = input.color;

  await updateSection(input.sectionId, patch);
  revalidatePath(`/recordings/${recordingId}`);
  return { ok: true };
}

export async function deleteSectionAction(input: {
  sectionId: string;
}): Promise<{ ok: true }> {
  const userId = await requireUserId();
  const recordingId = await assertSectionAccess(input.sectionId, userId);
  await deleteSection(input.sectionId);
  revalidatePath(`/recordings/${recordingId}`);
  return { ok: true };
}
