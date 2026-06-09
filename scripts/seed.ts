/**
 * Seeds the initial admin account and the default project.
 * Idempotent: safe to run repeatedly. Invoked via `npm run seed`.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { user, projectMembers } from "@/server/db/schema";
import { auth } from "@/server/auth";
import { getOrCreateDefaultProject } from "@/server/projects";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "Admin";

  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set to seed.");
  }

  let admin = await db.query.user.findFirst({
    where: eq(user.email, email.toLowerCase()),
  });

  if (!admin) {
    // Headerless (trusted server) createUser bypasses the admin-session check.
    await auth.api.createUser({
      body: { email, password, name, role: "admin" },
    });
    admin = await db.query.user.findFirst({
      where: eq(user.email, email.toLowerCase()),
    });
    console.log(`Created admin user: ${email}`);
  } else {
    if (admin.role !== "admin") {
      await db.update(user).set({ role: "admin" }).where(eq(user.id, admin.id));
    }
    console.log(`Admin user already exists: ${email}`);
  }

  const project = await getOrCreateDefaultProject(admin?.id);

  if (admin) {
    await db
      .insert(projectMembers)
      .values({ projectId: project.id, userId: admin.id, role: "admin" })
      .onConflictDoNothing();
  }

  console.log(`Default project ready: ${project.name} (${project.id})`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
