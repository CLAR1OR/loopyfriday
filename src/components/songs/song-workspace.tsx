"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChordProPreview } from "@/components/songs/chordpro-preview";
import { lineDiff } from "@/lib/linediff";
import {
  restoreVersionAction,
  saveLyricsAction,
  updateSongAction,
} from "@/server/song-actions";

const selectClass =
  "flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

type SongStatus = "idea" | "wip" | "done";

export interface ClientVersion {
  id: string;
  message: string | null;
  content: string;
  authorName: string | null;
  isCurrent: boolean;
  when: string;
}

export function SongWorkspace({
  songId,
  initialTitle,
  initialStatus,
  currentUserName,
  originRecording,
  initialContent,
  initialVersions,
}: {
  songId: string;
  initialTitle: string;
  initialStatus: SongStatus;
  currentUserName: string;
  originRecording: { id: string; title: string; status: string } | null;
  initialContent: string;
  initialVersions: ClientVersion[];
}) {
  const [content, setContent] = useState(initialContent);
  const [message, setMessage] = useState("");
  const [versions, setVersions] = useState<ClientVersion[]>(initialVersions);
  const [saving, setSaving] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  );

  const latestContent = versions[0]?.content ?? initialContent;
  const dirty = content !== latestContent;

  const selectedVersion = useMemo(
    () => versions.find((v) => v.id === selectedVersionId) ?? null,
    [versions, selectedVersionId],
  );
  const diff = useMemo(
    () => (selectedVersion ? lineDiff(selectedVersion.content, content) : null),
    [selectedVersion, content],
  );

  function prependVersion(v: ClientVersion) {
    setVersions((prev) => [v, ...prev.map((x) => ({ ...x, isCurrent: false }))]);
  }

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const { versionId } = await saveLyricsAction({
        songId,
        content,
        message: message || undefined,
      });
      prependVersion({
        id: versionId,
        message: message || null,
        content,
        authorName: currentUserName,
        isCurrent: true,
        when: "just now",
      });
      setMessage("");
    } finally {
      setSaving(false);
    }
  }

  async function restore(v: ClientVersion) {
    setSaving(true);
    try {
      const { versionId } = await restoreVersionAction({
        songId,
        versionId: v.id,
      });
      setContent(v.content);
      prependVersion({
        id: versionId,
        message: "Restored an earlier version",
        content: v.content,
        authorName: currentUserName,
        isCurrent: true,
        when: "just now",
      });
      setSelectedVersionId(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          defaultValue={initialTitle}
          onBlur={(e) => {
            const title = e.target.value.trim();
            if (title && title !== initialTitle) {
              void updateSongAction({ songId, title }).catch(() => {});
            }
          }}
          className="h-9 max-w-sm text-base font-semibold"
        />
        <select
          defaultValue={initialStatus}
          onChange={(e) =>
            void updateSongAction({
              songId,
              status: e.target.value as SongStatus,
            }).catch(() => {})
          }
          className={selectClass}
        >
          <option value="idea">Idea</option>
          <option value="wip">In progress</option>
          <option value="done">Done</option>
        </select>
      </div>

      {originRecording ? (
        <div className="rounded-md border p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">
              From recording:{" "}
              <Link
                href={`/recordings/${originRecording.id}`}
                className="font-medium text-foreground underline"
              >
                {originRecording.title}
              </Link>
            </span>
          </div>
          {originRecording.status === "ready" ? (
            <audio
              controls
              preload="none"
              src={`/api/stream/${originRecording.id}`}
              className="mt-2 w-full"
            />
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              ChordPro editor
            </h2>
            <span className="text-xs text-muted-foreground">
              {dirty ? "Unsaved changes" : "Saved"}
            </span>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            className="h-80 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            placeholder={"{start_of_verse}\n[C]Type lyrics with [G]chords\n{end_of_verse}"}
          />
          <div className="flex items-center gap-2">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe this change (optional)"
              className="h-8"
            />
            <Button onClick={save} disabled={!dirty || saving}>
              {saving ? "Saving…" : "Save version"}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Preview</h2>
          <div className="min-h-80 rounded-md border p-3">
            <ChordProPreview content={content} />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          History ({versions.length})
        </h2>
        <ul className="divide-y rounded-md border">
          {versions.map((v) => (
            <li key={v.id} className="px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedVersionId((cur) => (cur === v.id ? null : v.id))
                  }
                  className="flex-1 text-left hover:underline"
                >
                  <span className="font-medium">{v.message ?? "Saved"}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {v.when}
                    {v.authorName ? ` · ${v.authorName}` : ""}
                  </span>
                </button>
                {v.isCurrent ? (
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                    Current
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={saving}
                    onClick={() => restore(v)}
                  >
                    Restore
                  </Button>
                )}
              </div>

              {selectedVersionId === v.id && diff ? (
                <div className="mt-2 overflow-x-auto rounded border bg-muted/30 p-2 font-mono text-xs">
                  <p className="mb-1 text-muted-foreground">
                    Changes from this version to the current editor:
                  </p>
                  {diff.map((op, idx) => (
                    <div
                      key={idx}
                      className={
                        op.type === "add"
                          ? "text-emerald-600"
                          : op.type === "del"
                            ? "text-destructive line-through"
                            : "text-muted-foreground"
                      }
                    >
                      <span className="select-none opacity-60">
                        {op.type === "add" ? "+ " : op.type === "del" ? "- " : "  "}
                      </span>
                      {op.text || " "}
                    </div>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
