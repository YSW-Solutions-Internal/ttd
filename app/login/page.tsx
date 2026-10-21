"use client";

import { use, useActionState } from "react";
import { signIn, type LoginState } from "./actions";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
  const { error: linkError } = use(searchParams);

  return (
    <main className="login">
      <h1>Sign in</h1>
      <p className="sub">TTD staff only. Ask an admin if you need an invite.</p>
      {linkError === "invite" && (
        <div className="msg error" style={{ marginBottom: 12 }}>
          That invite link is invalid or has expired. Ask an admin to invite you again.
        </div>
      )}
      <form action={action} className="card">
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <button type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
        {state.error && <div className="msg error">{state.error}</div>}
      </form>
    </main>
  );
}
