"use client";

import { useEffect, useRef, useState } from "react";
import {
  deleteScoreAction,
  listScoresAction,
  type ScoreEntity,
} from "@/server/score-actions";
import type { AttachedFile } from "@/server/files";

export function Scores({
  entityType,
  entityId,
  canEdit = true,
}: {
  entityType: ScoreEntity;
  entityId: string;
  canEdit?: boolean;
}) {
  const [items, setItems] = useState<AttachedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    listScoresAction({ entityType, entityId })
      .then((data) => active && setItems(data))
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [entityType, entityId]);

  async function upload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("entityType", entityType);
      form.set("entityId", entityId);
      const res = await fetch("/api/scores", { method: "POST", body: form });
      if (!res.ok) {
        setError(
          res.status === 415
            ? "Only PDF or image files are supported."
            : res.status === 413
              ? "That file is too large (max 25 MB)."
              : "Upload failed.",
        );
        return;
      }
      const item = (await res.json()) as AttachedFile;
      setItems((prev) => [...prev, item]);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(attachmentId: string) {
    await deleteScoreAction({ attachmentId }).then(() =>
      setItems((prev) => prev.filter((i) => i.attachmentId !== attachmentId)),
    );
  }

  return (
    <div className="space-y-3">
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading scores…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No scores attached.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.attachmentId} className="rounded-md border p-2">
              <div className="mb-2 flex items-center gap-2">
                <span className="truncate text-sm font-medium">
                  {item.filename ?? "Score"}
                </span>
                <a
                  href={`/api/files/${item.fileId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground underline"
                >
                  Open
                </a>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => remove(item.attachmentId)}
                    className="ml-auto text-xs text-muted-foreground hover:text-destructive"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              {item.kind === "score_image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/files/${item.fileId}`}
                  alt={item.filename ?? "Score"}
                  className="max-h-96 w-auto rounded border"
                />
              ) : item.kind === "score_pdf" ? (
                <iframe
                  src={`/api/files/${item.fileId}`}
                  title={item.filename ?? "Score PDF"}
                  className="h-96 w-full rounded border"
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <div className="space-y-1">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
            className="block text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1 file:text-sm"
          />
          {uploading ? (
            <p className="text-xs text-muted-foreground">Uploading…</p>
          ) : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
