/**
 * ChordPro parsing helper. We parse with chordsheetjs but render the resulting
 * AST to React ourselves (see ChordProPreview) rather than using its HTML
 * formatter, because that formatter does NOT escape lyric/chord text — feeding
 * it to dangerouslySetInnerHTML would be an XSS hole.
 */
import { ChordProParser } from "chordsheetjs";

export interface ChordColumn {
  chord: string;
  lyrics: string;
}
export interface ChordLineDTO {
  columns: ChordColumn[];
}
export interface ChordParagraphDTO {
  type: string; // "verse" | "chorus" | "bridge" | "none" | ...
  lines: ChordLineDTO[];
}

type Item = { chords?: string; lyrics?: string };

function isBlank(col: ChordColumn) {
  return col.chord === "" && col.lyrics.trim() === "";
}

export function parseChordPro(content: string): ChordParagraphDTO[] {
  if (!content.trim()) return [];

  const song = new ChordProParser().parse(content);

  return song.bodyParagraphs
    .map((paragraph) => ({
      type: paragraph.type ?? "none",
      lines: paragraph.lines
        .map((line) => {
          const columns = (line.items as unknown as Item[])
            .filter((it) => "lyrics" in it)
            .map((it) => ({ chord: it.chords ?? "", lyrics: it.lyrics ?? "" }));
          return { columns };
        })
        // Drop fully-empty lines (blank separators inside a paragraph).
        .filter((line) => line.columns.some((c) => !isBlank(c))),
    }))
    .filter((paragraph) => paragraph.lines.length > 0);
}
