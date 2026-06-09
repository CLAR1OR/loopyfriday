"use server";

import { getCurrentUser } from "@/server/auth/session";
import { createRecording } from "@/server/recordings";
import { addProjectMember, getOrCreateDefaultProject } from "@/server/projects";

/**
 * Create the recording row before the upload starts, so the client has an id to
 * attach as tus metadata and to navigate to. Returns the new recording id.
 */
export async function createRecordingAction(input: {
  title?: string;
}): Promise<{ recordingId: string }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const project = await getOrCreateDefaultProject();
  // Self-heal membership so the upload's authorization check passes.
  await addProjectMember(project.id, user.id, "member");

  const title = input.title?.trim() || "Untitled recording";
  const rec = await createRecording({
    projectId: project.id,
    uploadedBy: user.id,
    title,
  });
  return { recordingId: rec.id };
}
