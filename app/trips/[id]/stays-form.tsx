"use client";

import { useActionState } from "react";
import { deleteStay, saveStay, type StayFormState } from "../stay-actions";

export type StayValues = {
  id: string;
  destination_code: string | null;
  starts_on: string | null;
  ends_on: string | null;
  highlight: string | null;
};
export type DestinationOption = { code: string; label: string };

/** One Stay as a table row of inputs, or the empty "add" row when `stay` is missing. */
export function StayRow({
  tripId,
  stay,
  destinations,
}: {
  tripId: string;
  stay?: StayValues;
  destinations: DestinationOption[];
}) {
  const [state, action, pending] = useActionState<StayFormState, FormData>(
    saveStay.bind(null, tripId, stay?.id ?? null),
    {},
  );
  const formId = `stay-${stay?.id ?? "new"}`;

  return (
    <tr>
      <td>
        {/* The form sits in one cell; the other inputs join it with form={formId}. */}
        <form id={formId} action={action} />
        <select form={formId} name="destination_code" aria-label="Destination" defaultValue={stay?.destination_code ?? ""} required>
          <option value="" disabled>
            Destination…
          </option>
          {destinations.map((d) => (
            <option key={d.code} value={d.code}>
              {d.label}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input form={formId} type="date" name="starts_on" aria-label="Arrive" defaultValue={stay?.starts_on ?? ""} />
      </td>
      <td>
        <input form={formId} type="date" name="ends_on" aria-label="Depart" defaultValue={stay?.ends_on ?? ""} />
      </td>
      <td>
        <input form={formId} type="text" name="highlight" aria-label="Highlight" defaultValue={stay?.highlight ?? ""} />
      </td>
      <td className="stay-actions">
        <button form={formId} type="submit" disabled={pending}>
          {pending ? "Saving…" : stay ? "Save" : "Add"}
        </button>
        {stay && (
          <button
            form={formId}
            type="submit"
            className="danger"
            formAction={deleteStay.bind(null, stay.id)}
            onClick={(e) => {
              if (!confirm("Delete this Stay? Accommodation options placed in it become unplaced.")) e.preventDefault();
            }}
          >
            Delete
          </button>
        )}
        {state.error && <span className="msg error">{state.error}</span>}
        {state.notice && <span className="msg">{state.notice}</span>}
      </td>
    </tr>
  );
}
