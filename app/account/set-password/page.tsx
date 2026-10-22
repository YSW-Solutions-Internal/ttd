"use client";

import { use, useActionState } from "react";
import { setPassword, type SetPasswordState } from "./actions";

export default function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const [state, action, pending] = useActionState<SetPasswordState, FormData>(setPassword, {});
  const isReset = use(searchParams).reset === "1";

  return (
    <main className="login">
      <h1>{isReset ? "Choose a new password" : "Choose a password"}</h1>
      <p className="sub">
        {isReset
          ? "Set a new password for TTD Quotes."
          : "You were invited to TTD Quotes. Set a password to finish."}
      </p>
      <form action={action} className="card">
        <div className="field">
          <label htmlFor="password">New password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="confirm">Repeat it</label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save and continue"}
        </button>
        {state.error && <div className="msg error">{state.error}</div>}
      </form>
    </main>
  );
}
