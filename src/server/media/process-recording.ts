import { mkdir } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { recordings } from "@/server/db/schema";
import { storage } from "@/server/storage";
import {
  generatePeaks,
  probe,
  transcodeToStream,
  transcodeToVideo,
} from "./ffmpeg";

/**
 * Full processing pipeline for an uploaded recording: probe -> transcode to a
 * seekable stream -> compute waveform peaks -> mark ready. Idempotent and
 * safe to retry (pg-boss may deliver at-least-once).
 */
export async function processRecording(recordingId: string) {
  const rec = await db.query.recordings.findFirst({
    where: eq(recordings.id, recordingId),
  });
  if (!rec) throw new Error(`recording not found: ${recordingId}`);
  if (!rec.storageKey) throw new Error(`recording has no source: ${recordingId}`);

  if (rec.status === "ready" && rec.streamKey && rec.peaksPath) return;

  await db
    .update(recordings)
    .set({ status: "processing", error: null })
    .where(eq(recordings.id, recordingId));

  try {
    const inputPath = storage.resolve(rec.storageKey);

    const meta = await probe(inputPath);
    const duration = meta.durationSeconds ?? 0;

    const streamKey = `streams/${rec.id}.m4a`;
    const streamOut = storage.resolve(streamKey);
    await mkdir(path.dirname(streamOut), { recursive: true });
    await transcodeToStream(inputPath, streamOut);

    const peaks = await generatePeaks(inputPath, duration || 1);
    const peaksKey = `peaks/${rec.id}.json`;
    await storage.writeBuffer(peaksKey, Buffer.from(JSON.stringify(peaks)));

    // If the upload is a video, also produce a web-playable copy to watch.
    let videoKey: string | null = null;
    if (meta.hasVideo) {
      videoKey = `videos/${rec.id}.mp4`;
      const videoOut = storage.resolve(videoKey);
      await mkdir(path.dirname(videoOut), { recursive: true });
      await transcodeToVideo(inputPath, videoOut, {
        videoCodec: meta.videoCodec,
        audioCodec: meta.audioCodec,
      });
    }

    await db
      .update(recordings)
      .set({
        status: "ready",
        streamKey,
        videoKey,
        peaksPath: peaksKey,
        peaksVersion: (rec.peaksVersion ?? 0) + 1,
        durationSeconds: duration || null,
        sampleRate: meta.sampleRate ?? null,
        sizeBytes: await storage.size(rec.storageKey),
        error: null,
      })
      .where(eq(recordings.id, recordingId));
  } catch (err) {
    await db
      .update(recordings)
      .set({ status: "failed", error: (err as Error).message.slice(0, 1000) })
      .where(eq(recordings.id, recordingId));
    throw err;
  }
}
