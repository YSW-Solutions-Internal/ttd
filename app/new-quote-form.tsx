"use client";

import { useActionState } from "react";
import { createQuote, type CreateQuoteState } from "./actions";

export function NewQuoteForm() {
  const [state, action, pending] = useActionState<CreateQuoteState, FormData>(createQuote, {});

  return (
    <form action={action} className="card">
      <div className="row">
        <div>
          <label htmlFor="title">Trip title</label>
          <input id="title" name="title" type="text" placeholder="e.g. Japan in cherry blossom season" required />
        </div>
        <div>
          <label htmlFor="client_name">Client name (optional)</label>
          <input id="client_name" name="client_name" type="text" />
        </div>
        <button type="submit" disabled={pending}>
          {pending ? "Creating…" : "New quote"}
        </button>
      </div>
      {state.error && <div className="msg error">{state.error}</div>}
    </form>
  );
}
