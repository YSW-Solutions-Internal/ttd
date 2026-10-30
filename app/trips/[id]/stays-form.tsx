"use client";

import { useState, useTransition } from "react";
import { AutosaveStatus, FieldError, useAutosave } from "@/app/autosave";
import { ConfirmButton } from "@/app/confirm-button";
import { deleteStay, saveStay } from "../stay-actions";
import { DestinationPicker } from "./destination-picker";
import { Msg } from "@/app/ui";

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
function Cells({
  formId,
  stay,
  destinations,
  onPick,
}: {
  formId: string;
  stay?: StayValues;
  destinations: DestinationOption[];
  onPick: (code: string) => void;
}) {
  return (
    <>
      <td>
        {/* The form sits in one cell; the other inputs join it with form={formId}. */}
        <form id={formId} />
        {/* Enter in a text box submits with the first submit button; this one does nothing, so Enter never arms Delete. */}
        <button form={formId} type="submit" disabled hidden aria-hidden="true" />
        <DestinationPicker value={stay?.destination_code} destinations={destinations} onPick={onPick} />
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
      <Cells formId={formId} stay={stay} destinations={destinations} onPick={(code) => autosave.change("destination_code", code)} />
      <td>
        <div className="flex flex-wrap items-center gap-3">
        <ConfirmButton form={formId} className="danger" formAction={deleteStay.bind(null, stay.id)} confirmLabel="Sure? Its hotels become unplaced">
          Delete
        </ConfirmButton>
        <AutosaveStatus autosave={autosave} />
        {["destination_code", "starts_on", "ends_on"].map((name) => (
          <FieldError key={name} autosave={autosave} name={name} />
        ))}
        </div>
      </td>
    </tr>
  );
}

/** Picking a destination adds the Stay; a fresh empty row then takes this one's place. */
function NewStay({ tripId, destinations }: Props) {
  const formId = "stay-new";
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add(code: string) {
    const fd = new FormData(document.getElementById(formId) as HTMLFormElement);
    fd.set("destination_code", code);
    startTransition(async () => {
      const r = await saveStay(tripId, null, fd);
      setError(r.error ?? null);
    });
  }

  return (
    <tr>
      <Cells formId={formId} destinations={destinations} onPick={add} />
      <td>
        <div className="flex flex-wrap items-center gap-3">
          {pending && <Msg as="span">Adding…</Msg>}
          {error && <Msg as="span" tone="error">{error}</Msg>}
        </div>
      </td>
    </tr>
  );
}
