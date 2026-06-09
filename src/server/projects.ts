import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { projects, projectMembers } from "@/server/db/schema";

export const DEFAULT_PROJECT_SLUG = "default";

/**
 * The app currently uses a single shared library. We model it as one "default"
 * project so multiple bands/projects can be introduced later without a schema
 * change. This returns it, creating it on first use.
 */
export async function getOrCreateDefaultProject(createdBy?: string) {
  const existing = await db.query.projects.findFirst({
    where: eq(projects.slug, DEFAULT_PROJECT_SLUG),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(projects)
    .values({ name: "Our Music", slug: DEFAULT_PROJECT_SLUG, createdBy })
    .onConflictDoNothing({ target: projects.slug })
    .returning();

  if (created) return created;

  // Lost a race; fetch the row the other writer created.
  const fallback = await db.query.projects.findFirst({
    where: eq(projects.slug, DEFAULT_PROJECT_SLUG),
  });
  if (!fallback) throw new Error("Failed to create default project");
  return fallback;
}

/** Add a user to a project. Idempotent (no-op if already a member). */
export async function addProjectMember(
  projectId: string,
  userId: string,
  role: "admin" | "member" = "member",
) {
  await db
    .insert(projectMembers)
    .values({ projectId, userId, role })
    .onConflictDoNothing();
}
