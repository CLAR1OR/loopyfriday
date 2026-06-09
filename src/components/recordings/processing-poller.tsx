"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** While a recording is processing, refresh the server component periodically. */
export function ProcessingPoller({ intervalMs = 4000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs]);
  return null;
}
