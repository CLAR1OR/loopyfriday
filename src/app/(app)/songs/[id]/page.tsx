import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Comments } from "@/components/comments/comments";
import { Scores } from "@/components/scores/scores";
import { SongAudios } from "@/components/songs/song-audios";
import { SongWorkspace } from "@/components/songs/song-workspace";
import { requireUser } from "@/server/auth/session";
import { listRecordings } from "@/server/recordings";
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

  const candidates = (await listRecordings(detail.song.projectId))
    .filter((r) => r.status === "ready")
    .map((r) => ({ id: r.id, title: r.title }));

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

      <Card>
        <CardHeader>
          <CardTitle>Audio</CardTitle>
        </CardHeader>
        <CardContent>
          <SongAudios
            songId={detail.song.id}
            initialAudios={detail.audios}
            candidates={candidates}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Scores</CardTitle>
          </CardHeader>
          <CardContent>
            <Scores entityType="song" entityId={detail.song.id} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Comments</CardTitle>
          </CardHeader>
          <CardContent>
            <Comments
              entityType="song"
              entityId={detail.song.id}
              currentUserId={user.id}
              isAdmin={user.role === "admin"}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
