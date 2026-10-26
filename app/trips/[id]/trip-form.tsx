"use client";

import { useActionState } from "react";
import { TRIP_STATUSES, tripStatusLabel } from "@/lib/trip-status";
import { saveTrip, type TripFormState } from "../actions";

export type TripValues = {
  id: string;
  status: string;
  title: string | null;
  starts_on: string | null;
  ends_on: string | null;
  nights: number | null;
  adults: number;
  children: number;
  visa_info: string | null;
  health_info: string | null;
  insurance_info: string | null;
  custom_notes: string | null;
};

/** The Trip's own details: everything on its Quote that no image supplies. */
export function TripForm({ trip }: { trip: TripValues }) {
  const [state, action, pending] = useActionState<TripFormState, FormData>(saveTrip.bind(null, trip.id), {});

  return (
    <form action={action} className="card">
      <div className="field">
        <label htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={trip.status}>
          {TRIP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {tripStatusLabel(s)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="title">Title</label>
        <input id="title" name="title" type="text" defaultValue={trip.title ?? ""} />
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div className="field">
          <label htmlFor="starts_on">Travel from</label>
          <input id="starts_on" name="starts_on" type="date" defaultValue={trip.starts_on ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="ends_on">Travel to</label>
          <input id="ends_on" name="ends_on" type="date" defaultValue={trip.ends_on ?? ""} />
        </div>
        <div className="field">
          <label>Nights</label>
          {/* Calculated by the database from the two dates. */}
          <div>{trip.nights ?? "—"}</div>
        </div>
        <div className="field">
          <label htmlFor="adults">Adults</label>
          <input id="adults" name="adults" type="number" min={0} step={1} required defaultValue={trip.adults} />
        </div>
        <div className="field">
          <label htmlFor="children">Children (0–17)</label>
          <input id="children" name="children" type="number" min={0} step={1} required defaultValue={trip.children} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="visa_info">Visa info</label>
        <textarea id="visa_info" name="visa_info" rows={2} defaultValue={trip.visa_info ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="health_info">Health info</label>
        <textarea id="health_info" name="health_info" rows={2} defaultValue={trip.health_info ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="insurance_info">Insurance info</label>
        <textarea id="insurance_info" name="insurance_info" rows={2} defaultValue={trip.insurance_info ?? ""} />
      </div>
      <div className="field">
        <label>Terms profile</label>
        {/* shortcut: only one profile exists, so it is shown, not chosen; add a select with the second profile's wording. */}
        <div>Standard (South Africa, international)</div>
      </div>
      <div className="field">
        <label htmlFor="custom_notes">Custom notes (each line is one extra term on the Quote)</label>
        <textarea id="custom_notes" name="custom_notes" rows={3} defaultValue={trip.custom_notes ?? ""} />
      </div>

      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
      {state.error && <div className="msg error">{state.error}</div>}
      {state.notice && <div className="msg">{state.notice}</div>}
    </form>
  );
}
