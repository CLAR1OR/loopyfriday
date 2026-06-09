import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import {
  attachments,
  lyricVersions,
  recordings,
  sections,
  songs,
  user,
} from "@/server/db/schema";
import { userInProject } from "@/server/recordings";

export type Song = typeof songs.$inferSelect;

/**
 * Promote a section into a song (idempotent): create the song with origin
 * links, seed the first lyric version from the section's lyrics, re-point the
 * section's attachments at the new song (same file_ids — no byte copy), and
 * cross-link section <-> song. Runs in one transaction.
 */
export async function promoteSection(sectionId: string, userId: string) {
  const section = await db.query.sections.findFirst({
    where: eq(sections.id, sectionId),
  });
  if (!section) throw new Error("Section not found");

  const recording = await db.query.recordings.findFirst({
    where: eq(recordings.id, section.recordingId),
  });
  if (!recording) throw new Error("Recording not found");
  if (!(await userInProject(userId, recording.projectId))) {
    throw new Error("Forbidden");
  }

  // Already promoted — return the existing song.
  if (section.promotedSongId) return section.promotedSongId;

  return db.transaction(async (tx) => {
    const [song] = await tx
      .insert(songs)
      .values({
        projectId: recording.projectId,
        createdBy: userId,
        title: section.name,
        status: "wip",
        originSectionId: section.id,
        originRecordingId: recording.id,
      })
      .returning();

    const [version] = await tx
      .insert(lyricVersions)
      .values({
        songId: song.id,
        authorId: userId,
        content: section.lyrics ?? "",
        message: "Promoted from section",
      })
      .returning();

    await tx
      .update(songs)
      .set({ currentLyricVersionId: version.id })
      .where(eq(songs.id, song.id));

    // Carry over any files attached to the section (scores, etc.).
    const sectionAttachments = await tx.query.attachments.findMany({
      where: and(
        eq(attachments.entityType, "section"),
        eq(attachments.entityId, section.id),
      ),
    });
    if (sectionAttachments.length > 0) {
      await tx.insert(attachments).values(
        sectionAttachments.map((a) => ({
          fileId: a.fileId,
          entityType: "song" as const,
          entityId: song.id,
          role: a.role,
          sortOrder: a.sortOrder,
        })),
      );
    }

    await tx
      .update(sections)
      .set({ promotedSongId: song.id })
      .where(eq(sections.id, section.id));

    return song.id;
  });
}

export async function listSongs(projectId: string) {
  return db.query.songs.findMany({
    where: eq(songs.projectId, projectId),
    orderBy: [desc(songs.updatedAt)],
  });
}

export async function getSongForUser(songId: string, userId: string) {
  const song = await db.query.songs.findFirst({ where: eq(songs.id, songId) });
  if (!song) return null;
  if (!(await userInProject(userId, song.projectId))) return null;
  return song;
}

export interface VersionSummary {
  id: string;
  message: string | null;
  content: string;
  createdAt: Date;
  authorName: string | null;
  isCurrent: boolean;
}

export interface SongDetail {
  song: Song;
  currentContent: string;
  versions: VersionSummary[];
  originRecording: { id: string; title: string; status: string } | null;
}

/** Full song view: current lyrics, version history, and the origin recording. */
export async function getSongDetail(songId: string): Promise<SongDetail | null> {
  const song = await db.query.songs.findFirst({ where: eq(songs.id, songId) });
  if (!song) return null;

  const versions = await db.query.lyricVersions.findMany({
    where: eq(lyricVersions.songId, songId),
    orderBy: [desc(lyricVersions.createdAt)],
  });

  const authorIds = [...new Set(versions.map((v) => v.authorId).filter(Boolean))];
  const authors = authorIds.length
    ? await db.query.user.findMany({
        where: inArray(user.id, authorIds as string[]),
      })
    : [];
  const nameById = new Map(authors.map((a) => [a.id, a.name]));

  const current =
    versions.find((v) => v.id === song.currentLyricVersionId) ?? versions[0];

  let originRecording = null;
  if (song.originRecordingId) {
    const rec = await db.query.recordings.findFirst({
      where: eq(recordings.id, song.originRecordingId),
    });
    if (rec) {
      originRecording = { id: rec.id, title: rec.title, status: rec.status };
    }
  }

  return {
    song,
    currentContent: current?.content ?? "",
    versions: versions.map((v) => ({
      id: v.id,
      message: v.message,
      content: v.content,
      createdAt: v.createdAt,
      authorName: v.authorId ? (nameById.get(v.authorId) ?? null) : null,
      isCurrent: v.id === (current?.id ?? null),
    })),
    originRecording,
  };
}

export async function getLyricVersion(versionId: string) {
  return db.query.lyricVersions.findFirst({
    where: eq(lyricVersions.id, versionId),
  });
}

/** Append a new lyric version and make it current. */
export async function addLyricVersion(opts: {
  songId: string;
  authorId: string;
  content: string;
  message?: string | null;
}) {
  return db.transaction(async (tx) => {
    const [version] = await tx
      .insert(lyricVersions)
      .values({
        songId: opts.songId,
        authorId: opts.authorId,
        content: opts.content,
        message: opts.message ?? null,
      })
      .returning();
    await tx
      .update(songs)
      .set({ currentLyricVersionId: version.id })
      .where(eq(songs.id, opts.songId));
    return version;
  });
}

export async function updateSong(
  songId: string,
  patch: Partial<{ title: string; status: "idea" | "wip" | "done" }>,
) {
  await db.update(songs).set(patch).where(eq(songs.id, songId));
}
