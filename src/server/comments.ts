import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import {
  comments,
  recordings,
  sections,
  songs,
  user,
  type CommentEntity,
} from "@/server/db/schema";
import { userInProject } from "@/server/recordings";

/** Resolve the owning project for any commentable entity. */
export async function resolveEntityProjectId(
  entityType: CommentEntity,
  entityId: string,
): Promise<string | null> {
  if (entityType === "song") {
    const s = await db.query.songs.findFirst({ where: eq(songs.id, entityId) });
    return s?.projectId ?? null;
  }
  if (entityType === "recording") {
    const r = await db.query.recordings.findFirst({
      where: eq(recordings.id, entityId),
    });
    return r?.projectId ?? null;
  }
  // section -> recording -> project
  const section = await db.query.sections.findFirst({
    where: eq(sections.id, entityId),
  });
  if (!section) return null;
  const rec = await db.query.recordings.findFirst({
    where: eq(recordings.id, section.recordingId),
  });
  return rec?.projectId ?? null;
}

export async function assertEntityAccess(
  entityType: CommentEntity,
  entityId: string,
  userId: string,
): Promise<string> {
  const projectId = await resolveEntityProjectId(entityType, entityId);
  if (!projectId || !(await userInProject(userId, projectId))) {
    throw new Error("Forbidden");
  }
  return projectId;
}

export interface CommentNode {
  id: string;
  authorId: string | null;
  authorName: string | null;
  body: string | null;
  createdAt: string;
  deleted: boolean;
  replies: CommentNode[];
}

/** All comments for an entity, two-level threaded (replies under top-level). */
export async function listThread(
  entityType: CommentEntity,
  entityId: string,
): Promise<CommentNode[]> {
  const rows = await db.query.comments.findMany({
    where: and(
      eq(comments.entityType, entityType),
      eq(comments.entityId, entityId),
    ),
    orderBy: [asc(comments.createdAt)],
  });

  const authorIds = [...new Set(rows.map((r) => r.authorId).filter(Boolean))];
  const authors = authorIds.length
    ? await db.query.user.findMany({
        where: inArray(user.id, authorIds as string[]),
      })
    : [];
  const nameById = new Map(authors.map((a) => [a.id, a.name]));

  const toNode = (r: (typeof rows)[number]): CommentNode => {
    const deleted = Boolean(r.deletedAt);
    return {
      id: r.id,
      authorId: deleted ? null : r.authorId,
      authorName: deleted ? null : (r.authorId ? (nameById.get(r.authorId) ?? null) : null),
      body: deleted ? null : r.body,
      createdAt: r.createdAt.toISOString(),
      deleted,
      replies: [],
    };
  };

  const nodes = new Map(rows.map((r) => [r.id, toNode(r)]));
  const roots: CommentNode[] = [];
  for (const r of rows) {
    const node = nodes.get(r.id)!;
    const parent = r.parentId ? nodes.get(r.parentId) : null;
    if (parent) parent.replies.push(node);
    else roots.push(node);
  }
  return roots;
}

export async function createComment(opts: {
  projectId: string;
  authorId: string;
  entityType: CommentEntity;
  entityId: string;
  parentId?: string | null;
  body: string;
}) {
  const [row] = await db
    .insert(comments)
    .values({
      projectId: opts.projectId,
      authorId: opts.authorId,
      entityType: opts.entityType,
      entityId: opts.entityId,
      parentId: opts.parentId ?? null,
      body: opts.body,
    })
    .returning();
  return row;
}

export async function getComment(commentId: string) {
  return db.query.comments.findFirst({ where: eq(comments.id, commentId) });
}

export async function softDeleteComment(commentId: string) {
  await db
    .update(comments)
    .set({ deletedAt: new Date() })
    .where(eq(comments.id, commentId));
}
