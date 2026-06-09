/**
 * Background job queue backed by Postgres via pg-boss (no Redis). The Next app
 * enqueues jobs; the worker process consumes them.
 */
import { PgBoss } from "pg-boss";
import { env } from "@/server/env";

export const PROCESS_RECORDING = "process-recording";

export interface ProcessRecordingJob {
  recordingId: string;
}

let bossPromise: Promise<PgBoss> | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (!bossPromise) {
    const boss = new PgBoss(env.DATABASE_URL);
    boss.on("error", (err: unknown) => console.error("[pg-boss]", err));
    bossPromise = (async () => {
      await boss.start();
      // createQueue is idempotent in practice; guard against "already exists".
      try {
        await boss.createQueue(PROCESS_RECORDING);
      } catch (err) {
        console.warn("[pg-boss] createQueue:", (err as Error).message);
      }
      return boss;
    })();
  }
  return bossPromise;
}

export async function enqueueProcessRecording(recordingId: string) {
  const boss = await getBoss();
  await boss.send(
    PROCESS_RECORDING,
    { recordingId } satisfies ProcessRecordingJob,
    { retryLimit: 5, retryBackoff: true },
  );
}
