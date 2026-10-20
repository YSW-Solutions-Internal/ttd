"use client";

import { useActionState } from "react";
import { createQuote, type CreateQuoteState } from "./actions";

export type ClientOption = { id: string; client_no: string; full_name: string };

export function NewQuoteForm({ clients }: { clients: ClientOption[] }) {
  const [state, action, pending] = useActionState<CreateQuoteState, FormData>(createQuote, {});

  return (
    <form action={action} className="card">
      <div className="row">
        <div>
          <label htmlFor="client_id">Existing client</label>
          <select id="client_id" name="client_id" defaultValue="">
            <option value="">Choose…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.client_no} · {c.full_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="new_client_name">or new client name</label>
          <input id="new_client_name" name="new_client_name" type="text" placeholder="e.g. Ron Wolovitz" />
        </div>
        <div>
          <label htmlFor="trip_title">Trip title (optional)</label>
          <input id="trip_title" name="trip_title" type="text" placeholder="e.g. London and Paris" />
        </div>
        <button type="submit" disabled={pending}>
          {pending ? "Creating…" : "New quote"}
        </button>
      </div>
      {state.error && <div className="msg error">{state.error}</div>}
    </form>
  );
}
