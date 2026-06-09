import Link from "next/link";
import { notFound } from "next/navigation";
import { Comments } from "@/components/comments/comments";
import { ProcessingPoller } from "@/components/recordings/processing-poller";
import { RecordingPlayer } from "@/components/recordings/recording-player";
import { RetryButton } from "@/components/recordings/retry-button";
import { requireUser } from "@/server/auth/session";
import { getRecordingForUser } from "@/server/recordings";
import { listSections } from "@/server/sections";

export const dynamic = "force-dynamic";

export default async function RecordingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const rec = await getRecordingForUser(id, user.id);
  if (!rec) notFound();

  const ready = Boolean(
    rec.status === "ready" && rec.streamKey && rec.peaksPath,
  );
  const sections = ready ? await listSections(id) : [];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          href="/sessions"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Sessions
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{rec.title}</h1>
      </div>

      {ready ? (
        <RecordingPlayer
          recordingId={rec.id}
          durationSeconds={rec.durationSeconds ?? 0}
          currentUserId={user.id}
          isAdmin={user.role === "admin"}
          initialSections={sections.map((s) => ({
            id: s.id,
            name: s.name,
            startSeconds: s.startSeconds,
            endSeconds: s.endSeconds,
            lyrics: s.lyrics,
            color: s.color,
            promotedSongId: s.promotedSongId,
          }))}
        />
      ) : rec.status === "failed" ? (
        <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <div>
            <p className="font-medium text-destructive">Processing failed</p>
            {rec.error ? (
              <p className="mt-1 text-muted-foreground">{rec.error}</p>
            ) : null}
          </div>
          <RetryButton recordingId={rec.id} />
        </div>
      ) : (
        <div className="rounded-md border p-4 text-sm text-muted-foreground">
          <ProcessingPoller />
          Processing your recording (transcoding + waveform). This page updates
          automatically.
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Comments</h2>
        <Comments
          entityType="recording"
          entityId={rec.id}
          currentUserId={user.id}
          isAdmin={user.role === "admin"}
        />
      </div>
    </div>
  );
}
