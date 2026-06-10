"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateRecordingAction } from "@/server/recording-actions";

export function RecordingEditor({
  recordingId,
  initialTitle,
  initialDate,
}: {
  recordingId: string;
  initialTitle: string;
  initialDate: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [date, setDate] = useState(initialDate ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await updateRecordingAction({
        recordingId,
        title,
        recordedOn: date,
      });
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor="re-title">Name</Label>
        <Input
          id="re-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-9 w-64"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="re-date">Date</Label>
        <Input
          id="re-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-9 w-auto"
        />
      </div>
      <Button size="sm" onClick={save} disabled={busy}>
        {busy ? "Saving…" : "Save"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setTitle(initialTitle);
          setDate(initialDate ?? "");
          setEditing(false);
        }}
        disabled={busy}
      >
        Cancel
      </Button>
    </div>
  );
}
