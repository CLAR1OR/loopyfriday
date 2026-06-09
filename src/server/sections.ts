import { asc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { sections } from "@/server/db/schema";

export type Section = typeof sections.$inferSelect;

/** Sections of a recording, ordered along the timeline. */
export async function listSections(recordingId: string) {
  return db.query.sections.findMany({
    where: eq(sections.recordingId, recordingId),
    orderBy: [asc(sections.startSeconds)],
  });
}

export async function createSection(opts: {
  recordingId: string;
  createdBy: string;
  name: string;
  startSeconds: number;
  endSeconds: number;
  color?: string | null;
  lyrics?: string | null;
}) {
  const [section] = await db
    .insert(sections)
    .values({
      recordingId: opts.recordingId,
      createdBy: opts.createdBy,
      name: opts.name,
      startSeconds: opts.startSeconds,
      endSeconds: opts.endSeconds,
      color: opts.color ?? null,
      lyrics: opts.lyrics ?? null,
    })
    .returning();
  return section;
}

export async function updateSection(
  sectionId: string,
  patch: Partial<{
    name: string;
    startSeconds: number;
    endSeconds: number;
    lyrics: string | null;
    color: string | null;
  }>,
) {
  const [updated] = await db
    .update(sections)
    .set(patch)
    .where(eq(sections.id, sectionId))
    .returning();
  return updated ?? null;
}

export async function getSection(sectionId: string) {
  return db.query.sections.findFirst({ where: eq(sections.id, sectionId) });
}

export async function deleteSection(sectionId: string) {
  await db.delete(sections).where(eq(sections.id, sectionId));
}
