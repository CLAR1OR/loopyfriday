"use client";

import { useEffect, useRef, useState } from "react";
import type WaveSurfer from "wavesurfer.js";
import type { Region } from "wavesurfer.js/dist/plugins/regions.esm.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createSectionAction,
  deleteSectionAction,
  updateSectionAction,
  type SectionDTO,
} from "@/server/section-actions";

const REGION_COLOR = "rgba(99, 102, 241, 0.18)";
const DRAG_COLOR = "rgba(99, 102, 241, 0.12)";

function fmt(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const byStart = (a: SectionDTO, b: SectionDTO) => a.startSeconds - b.startSeconds;

export function RecordingPlayer({
  recordingId,
  durationSeconds,
  initialSections,
}: {
  recordingId: string;
  durationSeconds: number;
  initialSections: SectionDTO[];
}) {
  const [sections, setSections] = useState<SectionDTO[]>(
    [...initialSections].sort(byStart),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionMap = useRef<Map<string, Region>>(new Map());
  const knownIds = useRef<Set<string>>(new Set());
  const sectionsRef = useRef(sections);
  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  // --- persistence handlers (ref-only, safe to register once) ---
  function persistCreated(region: Region) {
    if (knownIds.current.has(region.id)) return; // programmatic add
    const name = `Section ${sectionsRef.current.length + 1}`;
    createSectionAction({
      recordingId,
      name,
      startSeconds: region.start,
      endSeconds: region.end,
    })
      .then((dto) => {
        knownIds.current.add(dto.id);
        regionMap.current.delete(region.id);
        region.setOptions({ id: dto.id, content: dto.name, color: REGION_COLOR });
        regionMap.current.set(dto.id, region);
        setSections((prev) => [...prev, dto].sort(byStart));
        setSelectedId(dto.id);
      })
      .catch(() => region.remove());
  }

  function persistUpdated(region: Region) {
    if (!knownIds.current.has(region.id)) return;
    const id = region.id;
    setSections((prev) =>
      prev
        .map((s) =>
          s.id === id
            ? { ...s, startSeconds: region.start, endSeconds: region.end }
            : s,
        )
        .sort(byStart),
    );
    void updateSectionAction({
      sectionId: id,
      startSeconds: region.start,
      endSeconds: region.end,
    }).catch(() => {});
  }

  useEffect(() => {
    let destroyed = false;
    let ws: WaveSurfer | null = null;
    const regionMapSnap = regionMap.current;
    const knownSnap = knownIds.current;

    (async () => {
      const [{ default: WaveSurferCtor }, { default: RegionsPlugin }] =
        await Promise.all([
          import("wavesurfer.js"),
          import("wavesurfer.js/dist/plugins/regions.esm.js"),
        ]);
      if (destroyed || !containerRef.current) return;

      let peaks: number[][] | undefined;
      try {
        const res = await fetch(`/api/peaks/${recordingId}`);
        if (res.ok) {
          const json = (await res.json()) as { data?: number[] };
          if (json.data) peaks = [json.data];
        }
      } catch {
        // fall back to decoding from the stream
      }
      if (destroyed || !containerRef.current) return;

      ws = WaveSurferCtor.create({
        container: containerRef.current,
        url: `/api/stream/${recordingId}`,
        peaks,
        duration: durationSeconds || undefined,
        height: 96,
        waveColor: "#a1a1aa",
        progressColor: "#52525b",
        cursorColor: "#18181b",
        normalize: false,
      });
      wsRef.current = ws;

      const regions = ws.registerPlugin(RegionsPlugin.create());

      for (const s of sectionsRef.current) {
        knownIds.current.add(s.id);
        const region = regions.addRegion({
          id: s.id,
          start: s.startSeconds,
          end: s.endSeconds,
          content: s.name,
          color: REGION_COLOR,
          drag: true,
          resize: true,
        });
        regionMap.current.set(s.id, region);
      }

      regions.enableDragSelection({ color: DRAG_COLOR });
      regions.on("region-created", persistCreated);
      regions.on("region-updated", persistUpdated);
      regions.on("region-clicked", (region, e) => {
        e.stopPropagation();
        ws?.setTime(region.start);
        setSelectedId(region.id);
      });

      ws.on("ready", () => setReady(true));
      ws.on("play", () => setPlaying(true));
      ws.on("pause", () => setPlaying(false));
      ws.on("timeupdate", (t) => setCurrentTime(t));
    })();

    return () => {
      destroyed = true;
      wsRef.current?.destroy();
      wsRef.current = null;
      regionMapSnap.clear();
      knownSnap.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingId, durationSeconds]);

  // --- list actions ---
  function seekTo(id: string) {
    const s = sectionsRef.current.find((x) => x.id === id);
    if (!s || !wsRef.current) return;
    wsRef.current.setTime(s.startSeconds);
    setSelectedId(id);
  }

  function rename(id: string, name: string) {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
    regionMap.current.get(id)?.setOptions({ content: name || " " });
    void updateSectionAction({ sectionId: id, name }).catch(() => {});
  }

  function setLyrics(id: string, lyrics: string) {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, lyrics } : s)),
    );
    void updateSectionAction({ sectionId: id, lyrics }).catch(() => {});
  }

  function remove(id: string) {
    regionMap.current.get(id)?.remove();
    regionMap.current.delete(id);
    knownIds.current.delete(id);
    setSections((prev) => prev.filter((s) => s.id !== id));
    if (selectedId === id) setSelectedId(null);
    void deleteSectionAction({ sectionId: id }).catch(() => {});
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border p-4">
        <div ref={containerRef} className="w-full" />
        <div className="mt-3 flex items-center gap-3">
          <Button
            size="sm"
            onClick={() => wsRef.current?.playPause()}
            disabled={!ready}
          >
            {playing ? "Pause" : "Play"}
          </Button>
          <span className="text-sm tabular-nums text-muted-foreground">
            {fmt(currentTime)} / {fmt(durationSeconds)}
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            Drag across the waveform to tag a section.
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Sections ({sections.length})
        </h2>
        {sections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No sections yet — drag across the waveform above to create one.
          </p>
        ) : (
          <ul className="space-y-3">
            {sections.map((s) => (
              <li
                key={s.id}
                className={`rounded-md border p-3 ${
                  selectedId === s.id ? "border-foreground" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => seekTo(s.id)}
                    className="shrink-0 rounded bg-muted px-2 py-1 text-xs tabular-nums text-muted-foreground hover:bg-muted/70"
                    title="Seek to section"
                  >
                    {fmt(s.startSeconds)}–{fmt(s.endSeconds)}
                  </button>
                  <Input
                    defaultValue={s.name}
                    onBlur={(e) => {
                      if (e.target.value !== s.name) rename(s.id, e.target.value);
                    }}
                    className="h-8"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(s.id)}
                    className="text-destructive"
                  >
                    Delete
                  </Button>
                </div>
                <textarea
                  defaultValue={s.lyrics ?? ""}
                  onBlur={(e) => {
                    if ((e.target.value || null) !== (s.lyrics ?? null))
                      setLyrics(s.id, e.target.value);
                  }}
                  placeholder="Lyrics for this section (optional)"
                  className="mt-2 min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
