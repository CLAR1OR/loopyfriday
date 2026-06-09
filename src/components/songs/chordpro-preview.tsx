"use client";

import { useMemo } from "react";
import { parseChordPro } from "@/lib/chordpro";

const PARAGRAPH_LABEL: Record<string, string> = {
  chorus: "Chorus",
  verse: "Verse",
  bridge: "Bridge",
};

export function ChordProPreview({ content }: { content: string }) {
  const paragraphs = useMemo(() => {
    try {
      return parseChordPro(content);
    } catch {
      return null;
    }
  }, [content]);

  if (paragraphs === null) {
    return (
      <pre className="whitespace-pre-wrap text-sm text-muted-foreground">
        {content}
      </pre>
    );
  }

  if (paragraphs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing to preview yet. Type lyrics with chords like{" "}
        <code>[C]</code> above the words.
      </p>
    );
  }

  return (
    <div className="space-y-4 font-mono text-sm leading-tight">
      {paragraphs.map((p, pi) => {
        const label = PARAGRAPH_LABEL[p.type];
        const isChorus = p.type === "chorus";
        return (
          <div
            key={pi}
            className={isChorus ? "border-l-2 border-indigo-400 pl-3" : ""}
          >
            {label ? (
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {label}
              </div>
            ) : null}
            {p.lines.map((line, li) => (
              <div key={li} className="flex flex-wrap items-end">
                {line.columns.map((col, ci) => (
                  <span key={ci} className="inline-flex flex-col">
                    <span className="h-4 whitespace-pre font-semibold text-indigo-600">
                      {col.chord}
                    </span>
                    <span className="whitespace-pre">{col.lyrics}</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
