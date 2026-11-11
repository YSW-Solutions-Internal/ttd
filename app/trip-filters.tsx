"use client";

import Form from "next/form";
import { Select } from "@/app/select";
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
  consultants: { id: string; label: string }[];
  status: string;
  client: string;
  consultant: string;
  sort: string;
  dir: string;
}) {
  return (
    <Form action="/" className="mb-4 flex flex-wrap gap-3 [&>div]:min-w-[200px]" onChange={(e) => e.currentTarget.requestSubmit()}>
      <div>
        <label htmlFor="f-status">Status</label>
        <Select
          id="f-status"
          name="status"
          defaultValue={status}
          options={[
            ["current", "Current (open, plus Travelled or Cancelled in the last 90 days)"],
            ["open", "Open (Enquiry, Quoted, Booked)"],
            ["all", "All"],
            ...TRIP_STATUSES.map((s): [string, string] => [s, tripStatusLabel(s)]),
          ]}
        />
      </div>
      <div>
        <label htmlFor="f-consultant">Consultant</label>
        <Select
          id="f-consultant"
          name="consultant"
          defaultValue={consultant || "all"}
          options={[["all", "All consultants"], ...consultants.map((p): [string, string] => [p.id, p.label])]}
        />
      </div>
      <div>
        <label htmlFor="f-client">Client</label>
        <Select
          id="f-client"
          name="client"
          defaultValue={client}
          options={[["", "All clients"], ...clients.map((c): [string, string] => [c.id, `${c.client_code} · ${c.full_name}`])]}
        />
      </div>
      <input type="hidden" name="sort" value={sort} />
      <input type="hidden" name="dir" value={dir} />
      <noscript>
        <button type="submit">Filter</button>
      </noscript>
    </Form>
  );
}
