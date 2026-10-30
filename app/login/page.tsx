"use client";

import Link from "next/link";
import { use, useActionState } from "react";
import { signIn, type LoginState } from "./actions";
import { Msg } from "@/app/ui";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
  const { error: linkError } = use(searchParams);

  return (
    <main className="mx-auto max-w-[380px]">
      <h1>Sign in</h1>
      <p className="mb-4 text-muted">TTD staff only. Ask an admin if you need an invite.</p>
      {linkError === "link" && (
        <Msg tone="error" className="mb-3">
          That link has expired or was already used. Use <Link href="/login/forgot">Forgot password?</Link> to
          get a new one.
        </Msg>
      )}
      <form action={action} className="rounded-md border border-line bg-white p-5">
        <div className="mb-3">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="mb-3">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <button type="submit" disabled={pending} className="mt-1 w-full">
          {pending ? "Signing in…" : "Sign in"}
        </button>
        {state.error && <Msg tone="error" className="mt-2.5">{state.error}</Msg>}
      </form>
      <p className="mt-3 text-muted">
        <Link href="/login/forgot">Forgot password?</Link>
      </p>
    </main>
  );
}
