"use client";

import Form from "next/form";
import { TRIP_STATUSES, tripStatusLabel } from "@/lib/trip-status";

type ClientOption = { id: string; client_code: string; full_name: string };

// GET form: the filters live in the URL, so a filtered list survives refresh and modals.
export function TripFilters({
  clients,
  consultants,
  status,
  client,
  consultant,
  sort,
  dir,
}: {
  clients: ClientOption[];
  consultants?: { id: string; label: string }[]; // admins only
  status: string;
  client: string;
  consultant: string;
  sort: string;
  dir: string;
}) {
  return (
    <Form action="/" className="filters" onChange={(e) => e.currentTarget.requestSubmit()}>
      <div>
        <label htmlFor="f-status">Status</label>
        <select id="f-status" name="status" defaultValue={status}>
          <option value="all">All</option>
          {TRIP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {tripStatusLabel(s)}
            </option>
          ))}
        </select>
      </div>
      {consultants && (
        <div>
          <label htmlFor="f-consultant">Consultant</label>
          <select id="f-consultant" name="consultant" defaultValue={consultant}>
            <option value="">All consultants</option>
            {consultants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label htmlFor="f-client">Client</label>
        <select id="f-client" name="client" defaultValue={client}>
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.client_code} · {c.full_name}
            </option>
          ))}
        </select>
      </div>
      <input type="hidden" name="sort" value={sort} />
      <input type="hidden" name="dir" value={dir} />
      <noscript>
        <button type="submit">Filter</button>
      </noscript>
    </Form>
  );
}
