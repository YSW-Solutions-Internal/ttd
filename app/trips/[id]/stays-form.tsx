"use client";

import { useState, useTransition } from "react";
import { AutosaveStatus, FieldError, useAutosave } from "@/app/autosave";
import { ConfirmButton } from "@/app/confirm-button";
import { deleteStay, saveStay } from "../stay-actions";

export type StayValues = {
  id: string;
  destination_code: string | null;
  starts_on: string | null;
  ends_on: string | null;
  highlight: string | null;
};
export type DestinationOption = { code: string; label: string };

type Props = { tripId: string; stay?: StayValues; destinations: DestinationOption[] };

/** One Stay as a table row of inputs, or the empty "add" row when `stay` is missing. */
export function StayRow(props: Props) {
  return props.stay ? <ExistingStay {...props} stay={props.stay} /> : <NewStay {...props} />;
}

/** The inputs of one row; they join the row's form with form={formId}. */
function Cells({ formId, stay, destinations }: { formId: string; stay?: StayValues; destinations: DestinationOption[] }) {
  return (
    <>
      <td>
        {/* The form sits in one cell; the other inputs join it with form={formId}. */}
        <form id={formId} />
        {/* Enter in a text box submits with the first submit button; this one does nothing, so Enter never arms Delete. */}
        <button form={formId} type="submit" disabled hidden aria-hidden="true" />
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
    </>
  );
}

/** Each field saves as you leave it. */
function ExistingStay({ tripId, stay, destinations }: Props & { stay: StayValues }) {
  const formId = `stay-${stay.id}`;
  const label = destinations.find((d) => d.code === stay.destination_code)?.label ?? "untitled";
  const autosave = useAutosave({ key: stay.id, label: `Stay: ${label}`, save: (fd) => saveStay(tripId, stay.id, fd) });

  return (
    <tr ref={autosave.formRef}>
      <Cells formId={formId} stay={stay} destinations={destinations} />
      <td className="stay-actions">
        <ConfirmButton form={formId} className="danger" formAction={deleteStay.bind(null, stay.id)} confirmLabel="Sure? Its hotels become unplaced">
          Delete
        </ConfirmButton>
        <AutosaveStatus autosave={autosave} />
        {["destination_code", "starts_on", "ends_on"].map((name) => (
          <FieldError key={name} autosave={autosave} name={name} />
        ))}
      </td>
    </tr>
  );
}

/** Picking a destination adds the Stay; a fresh empty row then takes this one's place. */
function NewStay({ tripId, destinations }: Props) {
  const formId = "stay-new";
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add(e: React.ChangeEvent<HTMLTableRowElement>) {
    if ((e.target as HTMLElement).getAttribute("name") !== "destination_code") return;
    const form = document.getElementById(formId) as HTMLFormElement;
    startTransition(async () => {
      const r = await saveStay(tripId, null, new FormData(form));
      setError(r.error ?? null);
    });
  }

  return (
    <tr onChange={add}>
      <Cells formId={formId} destinations={destinations} />
      <td className="stay-actions">
        {pending && <span className="msg">Adding…</span>}
        {error && <span className="msg error">{error}</span>}
      </td>
    </tr>
  );
}
