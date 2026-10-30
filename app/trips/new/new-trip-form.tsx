"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createTrip, type CreateTripState } from "../actions";
import { Msg } from "@/app/ui";

export type ClientOption = { id: string; client_code: string; full_name: string };

export function NewTripForm({ clients, clientId }: { clients: ClientOption[]; clientId?: string }) {
  const [state, action, pending] = useActionState<CreateTripState, FormData>(createTrip, {});

  return (
    <form action={action} className="rounded-md border border-line bg-white p-5">
      <div className="mb-3">
        <label htmlFor="client_id">Client</label>
        <select id="client_id" name="client_id" defaultValue={clientId ?? ""} required>
          <option value="">Choose…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.client_code} · {c.full_name}
            </option>
          ))}
        </select>
        <div className="mt-1 text-xs text-muted">
          Not listed? <Link href="/clients/new?next=trip">Add a client</Link>
        </div>
      </div>
      <div className="mb-3">
        <label htmlFor="title">Trip title (optional)</label>
        <input id="title" name="title" type="text" placeholder="e.g. London and Paris" />
      </div>
      <button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create trip"}
      </button>
      {state.error && <Msg tone="error">{state.error}</Msg>}
    </form>
  );
}
