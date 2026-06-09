import { SiteHeader } from "@/components/app/site-header";
import { requireUser } from "@/server/auth/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader user={user} />
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</div>
    </div>
  );
}
