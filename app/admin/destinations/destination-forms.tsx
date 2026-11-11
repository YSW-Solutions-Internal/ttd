"use client";

import { useActionState, useState } from "react";
import { ConfirmButton } from "@/app/confirm-button";
import { countryNames } from "@/app/trips/[id]/destination-picker";
import { correctDestination, mergeDestination, removeDestination, type DestinationFormState } from "./actions";
import { Msg } from "@/app/ui";
import { Select } from "@/app/select";

export type DestinationRow = { code: string; name: string; country: string; stays: number };

const COUNTRIES_ID = "destination-countries";
const regionWarning = (stays: number) => `${stays} Stay${stays === 1 ? "'s" : "s'"} Fee region changes`;

function Message({ state }: { state: DestinationFormState }) {
  if (state.error) return <Msg tone="error">{state.error}</Msg>;
  if (state.notice) return <Msg>{state.notice}</Msg>;
  return null;
}

/** One list of countries for every row's country box. */
export function CountryList() {
  const [names] = useState(countryNames);
  return (
    <datalist id={COUNTRIES_ID}>
      {names.map((c) => <option key={c} value={c} />)}
    </datalist>
  );
}

export function CorrectForm({ d }: { d: DestinationRow }) {
  const [state, action, pending] = useActionState(correctDestination, {});
  const [country, setCountry] = useState(d.country);
  const moved = d.stays > 0 && country.trim() !== d.country;
  return (
    <form action={action} className="list-arrow-off flex flex-wrap items-center gap-2">
      <input type="hidden" name="code" value={d.code} />
      <input name="name" aria-label="Destination name" defaultValue={d.name} required />
      <input name="country" aria-label="Country" list={COUNTRIES_ID} value={country} onChange={(e) => setCountry(e.target.value)} required />
      {moved ? (
        <ConfirmButton confirmLabel={`Sure? ${regionWarning(d.stays)}`}>Save</ConfirmButton>
      ) : (
        <button type="submit" disabled={pending}>Save</button>
      )}
      <Message state={state} />
    </form>
  );
}

export function RemoveForm({ d }: { d: DestinationRow }) {
  const [state, action] = useActionState(removeDestination, {});
  if (d.stays > 0) return null;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="code" value={d.code} />
      <ConfirmButton>Remove</ConfirmButton>
      <Message state={state} />
    </form>
  );
}

export function MergeForm({ d, others }: { d: DestinationRow; others: DestinationRow[] }) {
  const [state, action] = useActionState(mergeDestination, {});
  const [into, setInto] = useState("");
  if (others.length === 0) return null;
  const target = others.find((o) => o.code === into);
  const moved = d.stays > 0 && target && target.country !== d.country;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="code" value={d.code} />
      <Select
        name="into"
        aria-label="Merge into"
        placeholder="Merge into…"
        value={into}
        onChange={setInto}
        options={others.map((o) => [o.code, `${o.name}, ${o.country} · ${o.code}`])}
      />
      <ConfirmButton confirmLabel={moved ? `Sure? ${regionWarning(d.stays)}` : "Sure? This one is removed"}>Merge</ConfirmButton>
      <Message state={state} />
    </form>
  );
}
