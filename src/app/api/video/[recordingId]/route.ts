/** Range-aware video streaming for recordings that have a video derivative. */
import { getCurrentUser } from "@/server/auth/session";
import { serveRangeFromStorage } from "@/server/http/range";
import { getRecordingForUser } from "@/server/recordings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ recordingId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  return serve(req, ctx);
}
export async function HEAD(req: Request, ctx: Ctx) {
  return serve(req, ctx);
}

async function serve(req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { recordingId } = await ctx.params;
  const rec = await getRecordingForUser(recordingId, user.id);
  if (!rec) return new Response("Not found", { status: 404 });
  if (!rec.videoKey) return new Response("No video", { status: 404 });

  return serveRangeFromStorage(req, rec.videoKey, "video/mp4");
}
