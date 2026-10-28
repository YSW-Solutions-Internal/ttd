"use client";

import Form from "next/form";

// GET form, like the Trips list's: the filter lives in the URL.
export function ClientFilters({ consultants, consultant }: { consultants: { id: string; label: string }[]; consultant: string }) {
  return (
    <Form action="/clients" className="filters" onChange={(e) => e.currentTarget.requestSubmit()}>
      <div>
        <label htmlFor="f-consultant">Consultant</label>
        <select id="f-consultant" name="consultant" defaultValue={consultant || "all"}>
          <option value="all">All consultants</option>
          {consultants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <noscript>
        <button type="submit">Filter</button>
      </noscript>
    </Form>
  );
}
