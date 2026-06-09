"use client";

import { useActionState } from "react";
import { adminCreateUserAction, type FormState } from "@/server/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: FormState = {};

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function CreateUserForm() {
  const [state, action, pending] = useActionState(
    adminCreateUserAction,
    initialState,
  );

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="cu-name">Name</Label>
        <Input id="cu-name" name="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cu-email">Email</Label>
        <Input id="cu-email" name="email" type="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cu-password">Temporary password</Label>
        <Input
          id="cu-password"
          name="password"
          type="password"
          minLength={8}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cu-role">Role</Label>
        <select id="cu-role" name="role" defaultValue="member" className={selectClass}>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      {state.ok && state.message ? (
        <p className="text-sm text-emerald-600">{state.message}</p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create user"}
      </Button>
    </form>
  );
}
