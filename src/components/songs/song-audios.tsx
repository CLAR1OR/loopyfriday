"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addSongAudioAction,
  removeSongAudioAction,
  renameSongAudioAction,
} from "@/server/song-actions";
import type { SongAudio } from "@/server/songs";

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function SongAudios({
  songId,
  initialAudios,
  candidates,
}: {
  songId: string;
  initialAudios: SongAudio[];
  candidates: { id: string; title: string }[];
}) {
  const [audios, setAudios] = useState<SongAudio[]>(initialAudios);
  const [pickId, setPickId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const available = candidates.filter(
    (c) => !audios.some((a) => a.recordingId === c.id),
  );

  function rename(id: string, title: string) {
    setAudios((prev) => prev.map((a) => (a.id === id ? { ...a, title } : a)));
    void renameSongAudioAction({ songAudioId: id, title }).catch(() => {});
  }

  function remove(id: string) {
    setAudios((prev) => prev.filter((a) => a.id !== id));
    void removeSongAudioAction({ songAudioId: id }).catch(() => {});
  }

  async function add() {
    if (!pickId || busy) return;
    setBusy(true);
    try {
      const next = await addSongAudioAction({
        songId,
        recordingId: pickId,
        title: newTitle.trim() || `ver${audios.length + 1}`,
      });
      setAudios(next);
      setPickId("");
      setNewTitle("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {audios.length === 0 ? (
        <p className="text-sm text-muted-foreground">No audios yet.</p>
      ) : (
        <ul className="space-y-3">
          {audios.map((a) => (
            <li key={a.id} className="space-y-2 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Input
                  defaultValue={a.title}
                  onBlur={(e) => {
                    if (e.target.value !== a.title) rename(a.id, e.target.value);
                  }}
                  className="h-8 min-w-32 flex-1"
                />
                <Link
                  href={`/recordings/${a.recordingId}`}
                  className="shrink-0 text-xs text-muted-foreground underline"
                >
                  {a.recordingTitle}
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(a.id)}
                  className="text-destructive"
                >
                  Remove
                </Button>
              </div>
              {a.playable ? (
                <audio
                  controls
                  preload="none"
                  src={`/api/stream/${a.recordingId}`}
                  className="w-full"
                />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Still processing — playback will appear once ready.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 ? (
        <div className="space-y-2 border-t pt-3">
          <p className="text-sm font-medium">Add an audio take</p>
          <select
            value={pickId}
            onChange={(e) => setPickId(e.target.value)}
            className={selectClass}
          >
            <option value="">Choose a recording…</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={`Title (e.g. ver${audios.length + 1})`}
            className="h-8"
          />
          <Button size="sm" onClick={add} disabled={!pickId || busy}>
            {busy ? "Adding…" : "Add audio"}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Upload more recordings on the Sessions page to attach them here.
        </p>
      )}
    </div>
  );
}
