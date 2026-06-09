import { desc } from "drizzle-orm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CreateUserForm } from "@/components/admin/create-user-form";
import { CreateInviteForm } from "@/components/admin/create-invite-form";
import { SetPasswordForm } from "@/components/admin/set-password-form";
import { requireAdmin } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { user } from "@/server/db/schema";

export const metadata = { title: "Admin · LoopyFriday" };

export default async function AdminPage() {
  await requireAdmin();

  const users = await db.query.user.findMany({
    orderBy: [desc(user.createdAt)],
  });

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-muted-foreground">
          Manage accounts. Open signup is disabled — people join by invite or
          by an account you create.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create user</CardTitle>
            <CardDescription>
              Adds an account directly with a temporary password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateUserForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Generate invite link</CardTitle>
            <CardDescription>
              The recipient sets their own name and password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateInviteForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reset a password</CardTitle>
            <CardDescription>Set a new password for any user.</CardDescription>
          </CardHeader>
          <CardContent>
            <SetPasswordForm
              users={users.map((u) => ({
                id: u.id,
                name: u.name,
                email: u.email,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Members ({users.length})</CardTitle>
            <CardDescription>Everyone with an account.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {users.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span>
                    {u.name}{" "}
                    <span className="text-muted-foreground">{u.email}</span>
                  </span>
                  <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {u.role ?? "member"}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
