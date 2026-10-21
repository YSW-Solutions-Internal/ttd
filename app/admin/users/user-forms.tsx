"use client";

import { useActionState } from "react";
import { inviteUser, setRole, type UserFormState } from "./actions";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/roles";

function Message({ state }: { state: UserFormState }) {
  if (state.error) return <div className="msg error">{state.error}</div>;
  if (state.notice) return <div className="msg">{state.notice}</div>;
  return null;
}

export function InviteUserForm() {
  const [state, action, pending] = useActionState<UserFormState, FormData>(inviteUser, {});

  return (
    <form action={action} className="card">
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="off" required />
      </div>

      <div className="field">
        <label htmlFor="full_name">Full name</label>
        <input id="full_name" name="full_name" type="text" autoComplete="off" />
      </div>

      <div className="field">
        <label htmlFor="role">Role</label>
        <select id="role" name="role" defaultValue="user">
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      <div className="sub" style={{ fontSize: 12 }}>
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
    <form action={action} style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input type="hidden" name="user_id" value={userId} />
      <select name="role" defaultValue={role} disabled={pending} style={{ width: "auto" }}>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      <button type="submit" className="link" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
      {state.error && (
        <span className="sub" style={{ margin: 0, fontSize: 12, color: "var(--danger)" }}>
          {state.error}
        </span>
      )}
    </form>
  );
}
