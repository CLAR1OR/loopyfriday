"use server";

/**
 * Server Actions for the auth flow. All of these are reachable via direct POST,
 * so every privileged action re-checks authorization on the server (see the
 * Next.js "Mutating Data" security note).
 */
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/server/auth";
import { getSession } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { appUrl } from "@/server/env";
import {
  createInvite,
  getValidInvite,
  markInviteAccepted,
} from "@/server/invites";
import { addProjectMember, getOrCreateDefaultProject } from "@/server/projects";

export interface FormState {
  error?: string;
  ok?: boolean;
  message?: string;
  inviteUrl?: string;
}

const MIN_PASSWORD = 8;

async function assertAdmin() {
  const session = await getSession();
  if (session?.user?.role !== "admin") {
    throw new Error("Forbidden");
  }
  return session;
}

/* ---------------------------------------------------------------- */
/* Sign in / out                                                     */
/* ---------------------------------------------------------------- */

export async function signInAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "Email and password are required." };
  }
  try {
    // nextCookies() persists the session cookie set by this call.
    await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
  } catch {
    return { error: "Invalid email or password." };
  }
  redirect("/sessions");
}

export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}

/* ---------------------------------------------------------------- */
/* Invite acceptance (unauthenticated, gated by a valid token)       */
/* ---------------------------------------------------------------- */

export async function acceptInviteAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const formEmail = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  const invite = await getValidInvite(token);
  if (!invite) {
    return { error: "This invite link is invalid or has expired." };
  }

  const email = invite.email ?? formEmail;
  if (!email) return { error: "Email is required." };
  if (!name) return { error: "Name is required." };
  if (password.length < MIN_PASSWORD) {
    return { error: `Password must be at least ${MIN_PASSWORD} characters.` };
  }

  // Headerless createUser takes the trusted-server path (no admin session
  // needed); the valid invite token is what authorizes this. Role is applied
  // separately below — createUser's typed role union doesn't include "member".
  try {
    await auth.api.createUser({ body: { email, password, name } });
  } catch {
    return {
      error: "Could not create the account — the email may already be in use.",
    };
  }

  const created = await db.query.user.findFirst({
    where: eq(user.email, email.toLowerCase()),
  });
  if (!created) return { error: "Account creation failed unexpectedly." };

  if (invite.role === "admin") {
    await db
      .update(user)
      .set({ role: "admin" })
      .where(eq(user.id, created.id));
  }

  const projectId =
    invite.projectId ?? (await getOrCreateDefaultProject(created.id)).id;
  await addProjectMember(projectId, created.id, invite.role);
  await markInviteAccepted(invite.id, created.id);

  // Auto sign-in; fall back to the login page if that step fails.
  try {
    await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
  } catch {
    redirect("/login");
  }
  redirect("/sessions");
}

/* ---------------------------------------------------------------- */
/* Admin actions                                                     */
/* ---------------------------------------------------------------- */

export async function adminCreateUserAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await assertAdmin();
  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = formData.get("role") === "admin" ? "admin" : "member";

  if (!email || !name) return { error: "Name and email are required." };
  if (password.length < MIN_PASSWORD) {
    return { error: `Password must be at least ${MIN_PASSWORD} characters.` };
  }

  try {
    // Role applied below — createUser's typed role union excludes "member".
    await auth.api.createUser({
      body: { email, password, name },
      headers: await headers(),
    });
  } catch {
    return { error: "Could not create user — the email may already exist." };
  }

  const created = await db.query.user.findFirst({
    where: eq(user.email, email.toLowerCase()),
  });
  if (created) {
    if (role === "admin") {
      await db
        .update(user)
        .set({ role: "admin" })
        .where(eq(user.id, created.id));
    }
    const project = await getOrCreateDefaultProject();
    await addProjectMember(project.id, created.id, role);
  }

  revalidatePath("/admin");
  return { ok: true, message: `Created ${email}.` };
}

export async function adminCreateInviteAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await assertAdmin();
  const role = formData.get("role") === "admin" ? "admin" : "member";
  const email =
    String(formData.get("email") ?? "")
      .trim()
      .toLowerCase() || null;

  const project = await getOrCreateDefaultProject(session.user.id);
  const invite = await createInvite({
    role,
    projectId: project.id,
    createdBy: session.user.id,
    email,
  });

  revalidatePath("/admin");
  return { ok: true, inviteUrl: `${appUrl}/invite/${invite.token}` };
}

export async function adminSetPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await assertAdmin();
  const userId = String(formData.get("userId") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");

  if (!userId) return { error: "Missing user." };
  if (newPassword.length < MIN_PASSWORD) {
    return { error: `Password must be at least ${MIN_PASSWORD} characters.` };
  }

  try {
    await auth.api.setUserPassword({
      body: { newPassword, userId },
      headers: await headers(),
    });
  } catch {
    return { error: "Could not set the password." };
  }

  return { ok: true, message: "Password updated." };
}
