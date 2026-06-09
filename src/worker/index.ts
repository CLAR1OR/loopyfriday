/**
 * Background worker entrypoint. Consumes pg-boss jobs (transcode + peaks).
 * Runs as its own container (`worker` service) using the same image.
 */
import "dotenv/config";
import {
  getBoss,
  PROCESS_RECORDING,
  type ProcessRecordingJob,
} from "@/server/queue";
import { processRecording } from "@/server/media/process-recording";
import { assertMediaTools } from "@/server/media/ffmpeg";

async function main() {
  // Fail fast if the image was built without working ffmpeg/ffprobe.
  await assertMediaTools();

  const boss = await getBoss();

  await boss.work<ProcessRecordingJob>(PROCESS_RECORDING, async (jobs) => {
    for (const job of jobs) {
      const { recordingId } = job.data;
      console.log(`[worker] processing recording ${recordingId}`);
      await processRecording(recordingId);
      console.log(`[worker] finished recording ${recordingId}`);
    }
  });

  console.log("[worker] ready, waiting for jobs");

  const shutdown = async () => {
    console.log("[worker] shutting down...");
    try {
      await boss.stop({ graceful: true });
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
