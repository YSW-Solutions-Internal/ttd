"use client";

import { use, useActionState } from "react";
import { setPassword, type SetPasswordState } from "./actions";
import { Msg } from "@/app/ui";

export default function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const [state, action, pending] = useActionState<SetPasswordState, FormData>(setPassword, {});
  const isReset = use(searchParams).reset === "1";

  return (
    <main className="mx-auto max-w-[380px] my-12">
      <h1>{isReset ? "Choose a new password" : "Choose a password"}</h1>
      <p className="mb-4 text-muted">
        {isReset
          ? "Set a new password for TTD Quotes."
          : "You were invited to TTD Quotes. Set a password to finish."}
      </p>
      <form action={action} className="rounded-md border border-line bg-white p-5">
        <div className="mb-3">
          <label htmlFor="password">
          {isReset ? "New password" : "Password"}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <div className="mb-3">
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
        <button type="submit" disabled={pending} className="mt-1 w-full">
          {pending ? "Saving…" : "Save and continue"}
        </button>
        {state.error && <Msg tone="error" className="mt-2.5">{state.error}</Msg>}
      </form>
    </main>
  );
}
