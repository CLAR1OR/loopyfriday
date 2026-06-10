"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  deleteRecordingMediaAction,
  deleteRecordingVideoAction,
} from "@/server/recording-actions";
import type { RecordingStorage } from "@/server/recordings";

function fmt(n: number) {
  if (n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function StorageManager({ initial }: { initial: RecordingStorage[] }) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  const videoTotal = items.reduce((s, r) => s + r.video, 0);
  const grandTotal = items.reduce((s, r) => s + r.total, 0);

  async function delVideo(id: string) {
    if (!confirm("Delete the video to free space? The audio and waveform stay.")) return;
    setBusy(id);
    try {
      await deleteRecordingVideoAction({ recordingId: id });
      setItems((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                video: 0,
                original: 0,
                hasVideo: false,
                total: r.audio + r.peaks,
              }
            : r,
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  async function delMedia(id: string) {
    if (!confirm("Delete ALL media (video + audio) for this recording? Sections and comments are kept, but playback and the waveform are gone."))
      return;
    setBusy(id);
    try {
      await deleteRecordingMediaAction({ recordingId: id });
      setItems((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                video: 0,
                audio: 0,
                original: 0,
                peaks: 0,
                total: 0,
                hasVideo: false,
                hasMedia: false,
              }
            : r,
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>
          Video files:{" "}
          <span className="font-semibold">{fmt(videoTotal)}</span>
        </span>
        <span className="text-muted-foreground">
          All media: {fmt(grandTotal)}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No recordings.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {items.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/recordings/${r.id}`}
                  className="font-medium hover:underline"
                >
                  {r.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {fmt(r.total)} total
                  {r.hasVideo ? ` · video ${fmt(r.video)}` : ""}
                  {r.audio ? ` · audio ${fmt(r.audio)}` : ""}
                  {r.original ? ` · original ${fmt(r.original)}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {r.hasVideo ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === r.id}
                    onClick={() => delVideo(r.id)}
                  >
                    Delete video
                  </Button>
                ) : null}
                {r.hasMedia ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={busy === r.id}
                    onClick={() => delMedia(r.id)}
                  >
                    Delete all media
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    media removed
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
