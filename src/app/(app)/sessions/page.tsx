import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UploadRecording } from "@/components/recordings/upload-recording";
import { requireUser } from "@/server/auth/session";
import { getOrCreateDefaultProject } from "@/server/projects";
import { listRecordings } from "@/server/recordings";
import type { RecordingStatus } from "@/server/db/schema";

export const metadata = { title: "Jam Sessions · LoopyFriday" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<RecordingStatus, string> = {
  uploaded: "Queued",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

function StatusBadge({ status }: { status: RecordingStatus }) {
  const tone =
    status === "ready"
      ? "bg-emerald-100 text-emerald-700"
      : status === "failed"
        ? "bg-destructive/10 text-destructive"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded px-2 py-0.5 text-xs ${tone}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export default async function SessionsPage() {
  await requireUser();
  const project = await getOrCreateDefaultProject();
  const recordings = await listRecordings(project.id);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Jam Sessions</h1>
        <p className="text-muted-foreground">
          Upload a recording, then tag its sections on the waveform.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload a recording</CardTitle>
          <CardDescription>
            Large files upload in chunks and resume if the connection drops.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UploadRecording />
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Recordings ({recordings.length})
        </h2>
        {recordings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No recordings yet — upload your first jam above.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {recordings.map((rec) => (
              <li key={rec.id}>
                <Link
                  href={`/recordings/${rec.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50"
                >
                  <span className="font-medium">{rec.title}</span>
                  <StatusBadge status={rec.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
