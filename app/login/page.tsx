"use client";

import Link from "next/link";
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
      {linkError === "link" && (
        <div className="msg error" style={{ marginBottom: 12 }}>
          That link has expired or was already used. Use <Link href="/login/forgot">Forgot password?</Link> to
          get a new one.
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
      <p className="sub" style={{ marginTop: 12 }}>
        <Link href="/login/forgot">Forgot password?</Link>
      </p>
    </main>
  );
}
