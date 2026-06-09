"use server";

import { getCurrentUser } from "@/server/auth/session";
import {
  assertEntityAccess,
  createComment,
  getComment,
  listThread,
  softDeleteComment,
  type CommentNode,
} from "@/server/comments";
import { userInProject } from "@/server/recordings";
import type { CommentEntity } from "@/server/db/schema";

export async function listCommentsAction(input: {
  entityType: CommentEntity;
  entityId: string;
}): Promise<CommentNode[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  await assertEntityAccess(input.entityType, input.entityId, user.id);
  return listThread(input.entityType, input.entityId);
}

export async function addCommentAction(input: {
  entityType: CommentEntity;
  entityId: string;
  parentId?: string | null;
  body: string;
}): Promise<CommentNode> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  const projectId = await assertEntityAccess(
    input.entityType,
    input.entityId,
    user.id,
  );

  const body = input.body.trim();
  if (!body) throw new Error("Comment cannot be empty");

  const row = await createComment({
    projectId,
    authorId: user.id,
    entityType: input.entityType,
    entityId: input.entityId,
    parentId: input.parentId ?? null,
    body,
  });

  return {
    id: row.id,
    authorId: user.id,
    authorName: user.name,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    deleted: false,
    replies: [],
  };
}

export async function deleteCommentAction(input: {
  commentId: string;
}): Promise<{ ok: true }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const comment = await getComment(input.commentId);
  if (!comment) throw new Error("Comment not found");

  const isAuthor = comment.authorId === user.id;
  const isAdmin = user.role === "admin";
  const inProject = comment.projectId
    ? await userInProject(user.id, comment.projectId)
    : false;
  if (!inProject || (!isAuthor && !isAdmin)) {
    throw new Error("Forbidden");
  }

  await softDeleteComment(input.commentId);
  return { ok: true };
}
