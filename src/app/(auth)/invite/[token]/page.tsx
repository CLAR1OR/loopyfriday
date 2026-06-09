import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AcceptInviteForm } from "@/components/auth/accept-invite-form";
import { getValidInvite } from "@/server/invites";

export const metadata = { title: "Accept invite · LoopyFriday" };

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await getValidInvite(token);

  if (!invite) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invite not valid</CardTitle>
          <CardDescription>
            This invite link is invalid or has expired. Ask an admin for a new
            one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login" className="text-sm underline">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>You&apos;ve been invited to LoopyFriday.</CardDescription>
      </CardHeader>
      <CardContent>
        <AcceptInviteForm token={token} lockedEmail={invite.email} />
      </CardContent>
    </Card>
  );
}
