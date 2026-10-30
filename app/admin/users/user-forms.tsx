"use client";

import { useActionState } from "react";
import { inviteUser, setRole, type UserFormState } from "./actions";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/roles";
import { Button, Msg } from "@/app/ui";

function Message({ state }: { state: UserFormState }) {
  if (state.error) return <Msg tone="error">{state.error}</Msg>;
  if (state.notice) return <Msg>{state.notice}</Msg>;
  return null;
}

export function InviteUserForm() {
  const [state, action, pending] = useActionState<UserFormState, FormData>(inviteUser, {});

  return (
    <form action={action} className="rounded-md border border-line bg-white p-5">
      <div className="mb-3">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="off" required />
      </div>

      <div className="mb-3">
        <label htmlFor="full_name">Full name</label>
        <input id="full_name" name="full_name" type="text" autoComplete="off" />
      </div>

      <div className="mb-3">
        <label htmlFor="role">Role</label>
        <select id="role" name="role" defaultValue="user">
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3 text-xs text-muted">
        They get an email with a link to choose their password. Nobody can create an
        account without an invitation.
      </div>

      <button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send invite"}
      </button>
      <Message state={state} />
    </form>
  );
}

export function RoleForm({ userId, role }: { userId: string; role: Role }) {
  const [state, action, pending] = useActionState<UserFormState, FormData>(setRole, {});

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="user_id" value={userId} />
      <select name="role" defaultValue={role} disabled={pending} className="w-auto">
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      <Button type="submit" variant="quiet" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      {state.error && (
        <span className="text-xs text-danger">{state.error}</span>
      )}
    </form>
  );
}
