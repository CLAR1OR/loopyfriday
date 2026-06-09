"use client";

import { useActionState } from "react";
import { adminCreateInviteAction, type FormState } from "@/server/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: FormState = {};

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function CreateInviteForm() {
  const [state, action, pending] = useActionState(
    adminCreateInviteAction,
    initialState,
  );

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="inv-email">Email (optional)</Label>
        <Input id="inv-email" name="email" type="email" placeholder="anyone with the link" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="inv-role">Role</Label>
        <select id="inv-role" name="role" defaultValue="member" className={selectClass}>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Generating…" : "Generate invite link"}
      </Button>
      {state.inviteUrl ? (
        <div className="space-y-1 pt-1">
          <Label htmlFor="inv-url">Share this link</Label>
          <Input
            id="inv-url"
            readOnly
            value={state.inviteUrl}
            onFocus={(e) => e.currentTarget.select()}
          />
          <p className="text-xs text-muted-foreground">
            The link is single-use and expires in 14 days.
          </p>
        </div>
      ) : null}
    </form>
  );
}
