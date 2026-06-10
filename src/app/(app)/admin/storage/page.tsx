import Link from "next/link";
import { StorageManager } from "@/components/admin/storage-manager";
import { requireAdmin } from "@/server/auth/session";
import { getOrCreateDefaultProject } from "@/server/projects";
import { getRecordingsStorage } from "@/server/recordings";

export const metadata = { title: "Storage · LoopyFriday" };
export const dynamic = "force-dynamic";

export default async function StoragePage() {
  await requireAdmin();
  const project = await getOrCreateDefaultProject();
  const items = await getRecordingsStorage(project.id);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          href="/admin"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Admin
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Storage</h1>
        <p className="text-muted-foreground">
          Free disk space by deleting a recording&apos;s video (keeping the audio
          and waveform) or all of its media.
        </p>
      </div>

      <StorageManager initial={items} />
    </div>
  );
}
