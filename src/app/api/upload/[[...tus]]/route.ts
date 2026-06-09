/**
 * Resumable upload endpoint (tus protocol) for jam recordings.
 *
 * App Router route handlers receive a raw Web Request (no body parsing), so we
 * hand it straight to @tus/server's `handleWeb`. Runs on the Node runtime
 * because the file-store writes to disk. The recording row is created up front
 * (see createRecordingAction) and referenced by the `recordingId` upload
 * metadata; here we just attach the landed bytes and enqueue processing.
 */
import { mkdirSync } from "node:fs";
import { nanoid } from "nanoid";
import { FileStore } from "@tus/file-store";
import { Server } from "@tus/server";
import { auth } from "@/server/auth";
import { env } from "@/server/env";
import { enqueueProcessRecording } from "@/server/queue";
import { attachUploadedFile, getRecording, userInProject } from "@/server/recordings";
import { UPLOAD_SUBDIR, uploadDirAbsolute } from "@/server/storage";

export const runtime = "nodejs";
// Never cache; allow long uploads.
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

mkdirSync(uploadDirAbsolute, { recursive: true });

const tusServer = new Server({
  path: "/api/upload",
  datastore: new FileStore({ directory: uploadDirAbsolute }),
  // Use our own ids so the storage key is stable and collision-free.
  namingFunction: () => nanoid(24),
  respectForwardedHeaders: true,
  // Reject uploads larger than the configured cap (tus checks Upload-Length).
  maxSize: env.UPLOAD_MAX_BYTES,
  async onUploadFinish(req, upload) {
    const recordingId = upload.metadata?.recordingId;
    if (!recordingId) {
      throw { status_code: 400, body: "missing recordingId metadata" };
    }

    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) throw { status_code: 401, body: "unauthorized" };

    const rec = await getRecording(recordingId);
    if (!rec || !(await userInProject(session.user.id, rec.projectId))) {
      throw { status_code: 403, body: "forbidden" };
    }

    await attachUploadedFile(recordingId, {
      storageKey: `${UPLOAD_SUBDIR}/${upload.id}`,
      mime: upload.metadata?.filetype ?? null,
      sizeBytes: upload.size ?? null,
      originalFilename: upload.metadata?.filename ?? null,
    });
    await enqueueProcessRecording(recordingId);

    return {};
  },
});

async function handler(req: Request): Promise<Response> {
  if (req.method !== "OPTIONS") {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) return new Response("Unauthorized", { status: 401 });
  }
  return tusServer.handleWeb(req);
}

export {
  handler as GET,
  handler as POST,
  handler as PATCH,
  handler as HEAD,
  handler as DELETE,
  handler as OPTIONS,
};
