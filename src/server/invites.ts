import { and, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/server/db/client";
import { invites } from "@/server/db/schema";

export type InviteRole = "admin" | "member";

const DEFAULT_TTL_DAYS = 14;

/** Create an invite and return it (the `token` is the secret in the link). */
export async function createInvite(opts: {
  role: InviteRole;
  projectId: string;
  createdBy?: string;
  email?: string | null;
  ttlDays?: number;
}) {
  const ttl = opts.ttlDays ?? DEFAULT_TTL_DAYS;
  const expiresAt = new Date(Date.now() + ttl * 24 * 60 * 60 * 1000);
  const [created] = await db
    .insert(invites)
    .values({
      token: nanoid(32),
      role: opts.role,
      projectId: opts.projectId,
      createdBy: opts.createdBy,
      email: opts.email?.toLowerCase() || null,
      expiresAt,
    })
    .returning();
  return created;
}

export type ValidInvite = NonNullable<Awaited<ReturnType<typeof getValidInvite>>>;

/**
 * Look up an invite by token and return it only if it is still usable
 * (not yet accepted and not expired). Returns null otherwise.
 */
export async function getValidInvite(token: string) {
  if (!token) return null;
  const invite = await db.query.invites.findFirst({
    where: and(eq(invites.token, token), isNull(invites.acceptedAt)),
  });
  if (!invite) return null;
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) return null;
  return invite;
}

/** Mark an invite consumed. Guarded on still-unaccepted to avoid double use. */
export async function markInviteAccepted(inviteId: string, userId: string) {
  const [updated] = await db
    .update(invites)
    .set({ acceptedAt: new Date(), acceptedBy: userId })
    .where(and(eq(invites.id, inviteId), isNull(invites.acceptedAt)))
    .returning();
  return updated ?? null;
}
