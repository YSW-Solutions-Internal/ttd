"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestReset, type ForgotState } from "./actions";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<ForgotState, FormData>(requestReset, {});

  return (
    <main className="login">
      <h1>Reset your password</h1>
      <p className="sub">Enter your email and we'll send you a link to choose a new password.</p>
      <form action={action} className="card">
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send reset link"}
        </button>
        {state.error && <div className="msg error">{state.error}</div>}
        {state.notice && <div className="msg">{state.notice}</div>}
      </form>
      <p className="sub" style={{ marginTop: 12 }}>
        <Link href="/login">Back to sign in</Link>
      </p>
    </main>
  );
}
