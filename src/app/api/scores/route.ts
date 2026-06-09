/**
 * Score upload: a small multipart POST (PDF or image) attached to a song,
 * section, or recording. Stored on disk; a files row + attachment are created.
 */
import { nanoid } from "nanoid";
import { getCurrentUser } from "@/server/auth/session";
import { resolveEntityProjectId } from "@/server/comments";
import { attachFile, createFileRecord } from "@/server/files";
import { userInProject } from "@/server/recordings";
import { storage } from "@/server/storage";
import type { AttachmentEntity, CommentEntity, FileKind } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED: Record<string, { kind: FileKind; ext: string }> = {
  "application/pdf": { kind: "score_pdf", ext: "pdf" },
  "image/png": { kind: "score_image", ext: "png" },
  "image/jpeg": { kind: "score_image", ext: "jpg" },
  "image/webp": { kind: "score_image", ext: "webp" },
  "image/gif": { kind: "score_image", ext: "gif" },
};
const MAX_BYTES = 25 * 1024 * 1024;
const ENTITY_TYPES = ["song", "section", "recording"];

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const entityType = String(form.get("entityType") ?? "");
  const entityId = String(form.get("entityId") ?? "");

  if (!(file instanceof File)) {
    return new Response("Missing file", { status: 400 });
  }
  if (!ENTITY_TYPES.includes(entityType) || !entityId) {
    return new Response("Bad entity", { status: 400 });
  }
  const meta = ALLOWED[file.type];
  if (!meta) return new Response("Unsupported file type", { status: 415 });
  if (file.size > MAX_BYTES) return new Response("File too large", { status: 413 });

  const projectId = await resolveEntityProjectId(
    entityType as CommentEntity,
    entityId,
  );
  if (!projectId || !(await userInProject(user.id, projectId))) {
    return new Response("Forbidden", { status: 403 });
  }

  const storageKey = `scores/${nanoid(20)}.${meta.ext}`;
  await storage.writeBuffer(storageKey, Buffer.from(await file.arrayBuffer()));

  const record = await createFileRecord({
    projectId,
    uploadedBy: user.id,
    kind: meta.kind,
    storageKey,
    filename: file.name,
    mime: file.type,
    sizeBytes: file.size,
  });
  const attachment = await attachFile({
    fileId: record.id,
    entityType: entityType as AttachmentEntity,
    entityId,
    role: "score",
  });

  return Response.json({
    attachmentId: attachment.id,
    fileId: record.id,
    filename: record.filename,
    mime: record.mime,
    kind: record.kind,
  });
}
