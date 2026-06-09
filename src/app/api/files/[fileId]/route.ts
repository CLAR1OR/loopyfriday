/** Serve an uploaded file (score PDF/image) inline, auth + access checked. */
import { Readable } from "node:stream";
import { getCurrentUser } from "@/server/auth/session";
import { getFileForUser } from "@/server/files";
import { storage } from "@/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ fileId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { fileId } = await ctx.params;
  const file = await getFileForUser(fileId, user.id);
  if (!file) return new Response("Not found", { status: 404 });

  let size: number;
  try {
    size = await storage.size(file.storageKey);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const stream = Readable.toWeb(
    storage.createReadStream(file.storageKey) as Readable,
  ) as unknown as ReadableStream<Uint8Array>;

  const safeName = (file.filename ?? "file").replace(/["\\\r\n]/g, "");
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": file.mime ?? "application/octet-stream",
      "Content-Length": String(size),
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
