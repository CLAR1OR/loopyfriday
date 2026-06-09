import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { getOrCreateDefaultProject } from "@/server/projects";
import { listSongs } from "@/server/songs";
import type { SongStatus } from "@/server/db/schema";

export const metadata = { title: "Songs · LoopyFriday" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<SongStatus, string> = {
  idea: "Idea",
  wip: "In progress",
  done: "Done",
};

function StatusBadge({ status }: { status: SongStatus }) {
  const tone =
    status === "done"
      ? "bg-emerald-100 text-emerald-700"
      : status === "wip"
        ? "bg-amber-100 text-amber-700"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded px-2 py-0.5 text-xs ${tone}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export default async function SongsPage() {
  await requireUser();
  const project = await getOrCreateDefaultProject();
  const songs = await listSongs(project.id);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Songs</h1>
        <p className="text-muted-foreground">
          Lyrics, chords, and versions. Promote a section from a recording to
          start a new song.
        </p>
      </div>

      {songs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No songs yet — open a recording, tag a section, and choose “Promote to
          song”.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {songs.map((song) => (
            <li key={song.id}>
              <Link
                href={`/songs/${song.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50"
              >
                <span className="font-medium">{song.title}</span>
                <StatusBadge status={song.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
