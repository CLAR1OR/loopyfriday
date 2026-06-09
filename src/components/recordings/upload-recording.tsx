"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as tus from "tus-js-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createRecordingAction } from "@/server/recording-actions";

type Phase = "idle" | "preparing" | "uploading" | "processing" | "error";

// 8 MB chunks keep each request bounded so a dropped connection only retries
// the current chunk — the basis for resuming long uploads.
const CHUNK_SIZE = 8 * 1024 * 1024;

export function UploadRecording() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [pct, setPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const uploadRef = useRef<tus.Upload | null>(null);

  const busy = phase === "preparing" || phase === "uploading";

  async function startUpload() {
    if (!file) return;
    setError(null);
    setPhase("preparing");

    let recordingId: string;
    try {
      ({ recordingId } = await createRecordingAction({
        title: title || file.name,
      }));
    } catch {
      setPhase("error");
      setError("Could not start the upload. Are you still signed in?");
      return;
    }

    const upload = new tus.Upload(file, {
      endpoint: "/api/upload",
      chunkSize: CHUNK_SIZE,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      removeFingerprintOnSuccess: true,
      metadata: {
        filename: file.name,
        filetype: file.type || "application/octet-stream",
        recordingId,
      },
      onError: (err) => {
        setPhase("error");
        setError(err.message || "Upload failed.");
      },
      onProgress: (sent, total) => {
        setPhase("uploading");
        setPct(total ? Math.round((sent / total) * 100) : 0);
      },
      onSuccess: () => {
        setPhase("processing");
        router.push(`/recordings/${recordingId}`);
      },
    });
    uploadRef.current = upload;

    // Resume a prior interrupted upload of the same file if one exists.
    const previous = await upload.findPreviousUploads();
    if (previous.length > 0) upload.resumeFromPreviousUpload(previous[0]);
    upload.start();
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="rec-title">Title</Label>
        <Input
          id="rec-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Friday jam — take 2"
          disabled={busy}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="rec-file">Audio file</Label>
        <Input
          id="rec-file"
          type="file"
          accept="audio/*"
          disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {phase === "uploading" || phase === "preparing" ? (
        <div className="space-y-1">
          <div className="h-2 w-full overflow-hidden rounded bg-muted">
            <div
              className="h-full bg-foreground transition-[width]"
              style={{ width: `${phase === "preparing" ? 2 : pct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {phase === "preparing" ? "Preparing…" : `Uploading ${pct}%`}
          </p>
        </div>
      ) : null}

      {phase === "processing" ? (
        <p className="text-sm text-muted-foreground">
          Upload complete — processing…
        </p>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button onClick={startUpload} disabled={!file || busy}>
        {busy ? "Uploading…" : "Upload recording"}
      </Button>
    </div>
  );
}
