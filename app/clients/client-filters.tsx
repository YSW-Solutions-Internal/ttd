"use client";

import Form from "next/form";
import { Select } from "@/app/select";

// GET form, like the Trips list's: the filter lives in the URL.
export function ClientFilters({ consultants, consultant }: { consultants: { id: string; label: string }[]; consultant: string }) {
  return (
    <Form action="/clients" className="mb-4 flex flex-wrap gap-3 [&>div]:min-w-[200px]" onChange={(e) => e.currentTarget.requestSubmit()}>
      <div>
        <label htmlFor="f-consultant">Consultant</label>
        <Select
          id="f-consultant"
          name="consultant"
          defaultValue={consultant || "all"}
          options={[["all", "All consultants"], ...consultants.map((p): [string, string] => [p.id, p.label])]}
        />
      </div>
      <noscript>
        <button type="submit">Filter</button>
      </noscript>
    </Form>
  );
}
