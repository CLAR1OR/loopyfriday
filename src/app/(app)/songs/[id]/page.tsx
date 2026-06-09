import Link from "next/link";
import { notFound } from "next/navigation";
import { SongWorkspace } from "@/components/songs/song-workspace";
import { requireUser } from "@/server/auth/session";
import { getSongDetail, getSongForUser } from "@/server/songs";

export const dynamic = "force-dynamic";

function formatWhen(date: Date) {
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function SongPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const song = await getSongForUser(id, user.id);
  if (!song) notFound();

  const detail = await getSongDetail(id);
  if (!detail) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/songs"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Songs
      </Link>

      <SongWorkspace
        songId={detail.song.id}
        initialTitle={detail.song.title}
        initialStatus={detail.song.status}
        currentUserName={user.name}
        originRecording={detail.originRecording}
        initialContent={detail.currentContent}
        initialVersions={detail.versions.map((v) => ({
          id: v.id,
          message: v.message,
          content: v.content,
          authorName: v.authorName,
          isCurrent: v.isCurrent,
          when: formatWhen(v.createdAt),
        }))}
      />
    </div>
  );
}
