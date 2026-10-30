"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestReset, type ForgotState } from "./actions";
import { Msg } from "@/app/ui";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<ForgotState, FormData>(requestReset, {});

  return (
    <main className="mx-auto max-w-[380px]">
      <h1>Reset your password</h1>
      <p className="mb-4 text-muted">Enter your email and we'll send you a link to choose a new password.</p>
      <form action={action} className="rounded-md border border-line bg-white p-5">
        <div className="mb-3">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <button type="submit" disabled={pending} className="mt-1 w-full">
          {pending ? "Sending…" : "Send reset link"}
        </button>
        {state.error && <Msg tone="error" className="mt-2.5">{state.error}</Msg>}
        {state.notice && <Msg className="mt-2.5">{state.notice}</Msg>}
      </form>
      <p className="mt-3 text-muted">
        <Link href="/login">Back to sign in</Link>
      </p>
    </main>
  );
}
