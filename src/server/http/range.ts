/**
 * Shared HTTP Range serving for media files in storage. Honors `Range` with a
 * 206 response (Accept-Ranges / Content-Range / sliced Content-Length) so
 * browsers can seek; falls back to a full 200. Handles HEAD too.
 */
import { Readable } from "node:stream";
import { storage } from "@/server/storage";

function toWeb(nodeStream: Readable): ReadableStream<Uint8Array> {
  return Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;
}

export async function serveRangeFromStorage(
  req: Request,
  key: string,
  contentType: string,
): Promise<Response> {
  let size: number;
  try {
    size = await storage.size(key);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const baseHeaders: Record<string, string> = {
    "Accept-Ranges": "bytes",
    "Content-Type": contentType,
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
    start = Math.max(0, size - end); // suffix range: final N bytes
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
