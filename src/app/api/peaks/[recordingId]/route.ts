/**
 * Serves the precomputed, normalized waveform peaks JSON for a recording so the
 * client can paint the waveform instantly without decoding the audio.
 */
import { readFile } from "node:fs/promises";
import { getCurrentUser } from "@/server/auth/session";
import { getRecordingForUser } from "@/server/recordings";
import { storage } from "@/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ recordingId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { recordingId } = await ctx.params;
  const rec = await getRecordingForUser(recordingId, user.id);
  if (!rec) return new Response("Not found", { status: 404 });
  if (!rec.peaksPath) {
    return Response.json({ error: "peaks not ready" }, { status: 404 });
  }

  try {
    const buf = await readFile(storage.resolve(rec.peaksPath));
    return new Response(buf, {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "private, max-age=30",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
