import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/server/auth/actions";

export function SiteHeader({
  user,
}: {
  user: { name: string; role?: string | null };
}) {
  const isAdmin = user.role === "admin";

  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-6">
        <Link href="/sessions" className="font-semibold">
          LoopyFriday
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link href="/sessions" className="hover:text-foreground">
            Sessions
          </Link>
          <Link href="/songs" className="hover:text-foreground">
            Songs
          </Link>
          {isAdmin ? (
            <Link href="/admin" className="hover:text-foreground">
              Admin
            </Link>
          ) : null}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{user.name}</span>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
