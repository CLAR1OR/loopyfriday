"use client";

import { useActionState } from "react";
import { adminSetPasswordAction, type FormState } from "@/server/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: FormState = {};

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function SetPasswordForm({
  users,
}: {
  users: { id: string; name: string; email: string }[];
}) {
  const [state, action, pending] = useActionState(
    adminSetPasswordAction,
    initialState,
  );

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="sp-user">User</Label>
        <select id="sp-user" name="userId" className={selectClass} required>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.email})
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="sp-password">New password</Label>
        <Input
          id="sp-password"
          name="newPassword"
          type="password"
          minLength={8}
          required
        />
      </div>
      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      {state.ok && state.message ? (
        <p className="text-sm text-emerald-600">{state.message}</p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Set password"}
      </Button>
    </form>
  );
}
