"use server";

import { getCurrentUser } from "@/server/auth/session";
import { resolveEntityProjectId } from "@/server/comments";
import {
  getAttachment,
  listAttachedFiles,
  removeAttachment,
  type AttachedFile,
} from "@/server/files";
import { userInProject } from "@/server/recordings";
import type { CommentEntity } from "@/server/db/schema";

export type ScoreEntity = "song" | "section" | "recording";

async function assertAccess(entityType: ScoreEntity, entityId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  const projectId = await resolveEntityProjectId(
    entityType as CommentEntity,
    entityId,
  );
  if (!projectId || !(await userInProject(user.id, projectId))) {
    throw new Error("Forbidden");
  }
  return user;
}

export async function listScoresAction(input: {
  entityType: ScoreEntity;
  entityId: string;
}): Promise<AttachedFile[]> {
  await assertAccess(input.entityType, input.entityId);
  return listAttachedFiles(input.entityType, input.entityId);
}

export async function deleteScoreAction(input: {
  attachmentId: string;
}): Promise<{ ok: true }> {
  const att = await getAttachment(input.attachmentId);
  if (!att) throw new Error("Not found");
  if (att.entityType === "comment") throw new Error("Forbidden");
  await assertAccess(att.entityType as ScoreEntity, att.entityId);
  await removeAttachment(input.attachmentId);
  return { ok: true };
}
