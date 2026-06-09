/**
 * Range-aware audio streaming for the transcoded recording. Honors HTTP Range
 * requests with 206 responses (Accept-Ranges / Content-Range / sliced
 * Content-Length) so browsers can seek smoothly. Auth-checked per request.
 *
 * Behind a reverse proxy this can later be offloaded via X-Accel-Redirect; the
 * direct path here works everywhere and is correct on its own.
 */
import { Readable } from "node:stream";
import { getCurrentUser } from "@/server/auth/session";
import { getRecordingForUser } from "@/server/recordings";
import { storage } from "@/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPE = "audio/mp4"; // AAC in an MP4 (.m4a) container

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
  if (!rec.streamKey) return new Response("Stream not ready", { status: 409 });

  const key = rec.streamKey;
  let size: number;
  try {
    size = await storage.size(key);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const baseHeaders: Record<string, string> = {
    "Accept-Ranges": "bytes",
    "Content-Type": CONTENT_TYPE,
    "Cache-Control": "private, max-age=0, must-revalidate",
  };

  const range = req.headers.get("range");
  const isHead = req.method === "HEAD";

  if (!range) {
    const headers = { ...baseHeaders, "Content-Length": String(size) };
    if (isHead) return new Response(null, { status: 200, headers });
    return new Response(toWeb(storage.createReadStream(key)), {
      status: 200,
      headers,
    });
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match || (match[1] === "" && match[2] === "")) {
    return new Response("Range Not Satisfiable", {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }

  let start = match[1] === "" ? Number.NaN : parseInt(match[1], 10);
  let end = match[2] === "" ? Number.NaN : parseInt(match[2], 10);

  if (Number.isNaN(start)) {
    // Suffix range: the final `end` bytes.
    start = Math.max(0, size - end);
    end = size - 1;
  } else if (Number.isNaN(end)) {
    end = size - 1;
  }
  end = Math.min(end, size - 1);

  if (start > end || start >= size) {
    return new Response("Range Not Satisfiable", {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }

  const headers = {
    ...baseHeaders,
    "Content-Range": `bytes ${start}-${end}/${size}`,
    "Content-Length": String(end - start + 1),
  };
  if (isHead) return new Response(null, { status: 206, headers });
  return new Response(toWeb(storage.createReadStream(key, { start, end })), {
    status: 206,
    headers,
  });
}

function toWeb(nodeStream: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
  return Readable.toWeb(
    nodeStream as Readable,
  ) as unknown as ReadableStream<Uint8Array>;
}
