import { and, asc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import {
  attachments,
  files,
  type AttachmentEntity,
  type FileKind,
} from "@/server/db/schema";
import { userInProject } from "@/server/recordings";

export async function createFileRecord(opts: {
  projectId: string;
  uploadedBy: string;
  kind: FileKind;
  storageKey: string;
  filename?: string | null;
  mime?: string | null;
  sizeBytes?: number | null;
}) {
  const [row] = await db
    .insert(files)
    .values({
      projectId: opts.projectId,
      uploadedBy: opts.uploadedBy,
      kind: opts.kind,
      storageKey: opts.storageKey,
      filename: opts.filename ?? null,
      mime: opts.mime ?? null,
      sizeBytes: opts.sizeBytes ?? null,
    })
    .returning();
  return row;
}

export async function attachFile(opts: {
  fileId: string;
  entityType: AttachmentEntity;
  entityId: string;
  role?: string | null;
}) {
  const [row] = await db
    .insert(attachments)
    .values({
      fileId: opts.fileId,
      entityType: opts.entityType,
      entityId: opts.entityId,
      role: opts.role ?? null,
    })
    .returning();
  return row;
}

export interface AttachedFile {
  attachmentId: string;
  fileId: string;
  filename: string | null;
  mime: string | null;
  kind: FileKind;
}

export async function listAttachedFiles(
  entityType: AttachmentEntity,
  entityId: string,
): Promise<AttachedFile[]> {
  return db
    .select({
      attachmentId: attachments.id,
      fileId: files.id,
      filename: files.filename,
      mime: files.mime,
      kind: files.kind,
    })
    .from(attachments)
    .innerJoin(files, eq(attachments.fileId, files.id))
    .where(
      and(
        eq(attachments.entityType, entityType),
        eq(attachments.entityId, entityId),
      ),
    )
    .orderBy(asc(attachments.sortOrder), asc(attachments.createdAt));
}

/** Fetch a file only if the user belongs to its project. */
export async function getFileForUser(fileId: string, userId: string) {
  const file = await db.query.files.findFirst({ where: eq(files.id, fileId) });
  if (!file || !file.projectId) return null;
  if (!(await userInProject(userId, file.projectId))) return null;
  return file;
}

export async function getAttachment(attachmentId: string) {
  return db.query.attachments.findFirst({
    where: eq(attachments.id, attachmentId),
  });
}

/** Remove an attachment (does not delete the underlying file — it may be shared). */
export async function removeAttachment(attachmentId: string) {
  await db.delete(attachments).where(eq(attachments.id, attachmentId));
}
