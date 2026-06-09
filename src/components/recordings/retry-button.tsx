"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { retryRecordingAction } from "@/server/recording-actions";

export function RetryButton({ recordingId }: { recordingId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      size="sm"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        retryRecordingAction({ recordingId })
          .then(() => router.refresh())
          .finally(() => setBusy(false));
      }}
    >
      {busy ? "Retrying…" : "Retry processing"}
    </Button>
  );
}
