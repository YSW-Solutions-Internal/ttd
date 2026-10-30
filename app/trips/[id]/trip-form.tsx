"use client";

import { AutosaveStatus, FieldError, useAutosave } from "@/app/autosave";
import { TRIP_STATUSES, tripStatusLabel } from "@/lib/trip-status";
import { saveTrip } from "../actions";

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
  ta_number: string | null;
  cost_centre: string | null;
  authorising_person: string | null;
};

/** The Trip's own details: everything on its Quote that no image supplies. Each field saves as you leave it. */
export function TripForm({ trip, company }: { trip: TripValues; company: boolean }) {
  const autosave = useAutosave({ key: trip.id, label: "Trip details", save: (fd) => saveTrip(trip.id, fd) });

  return (
    <form ref={autosave.formRef} className="rounded-md border border-line bg-white p-5">
      {/* Enter in a text box would submit the form; a disabled first submit button makes it do nothing. */}
      <button type="submit" disabled hidden aria-hidden="true" />
      <div className="grid grid-cols-[200px_1fr] gap-x-4 max-[700px]:grid-cols-1">
      <div className="mb-3">
        <label htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={trip.status}>
          {TRIP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {tripStatusLabel(s)}
            </option>
          ))}
        </select>
        <FieldError autosave={autosave} name="status" />
      </div>
      <div className="mb-3">
        <label htmlFor="title">Title</label>
        <input id="title" name="title" type="text" defaultValue={trip.title ?? ""} />
      </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4">
        <div className="mb-3">
          <label htmlFor="starts_on">Travel from</label>
          <input id="starts_on" name="starts_on" type="date" defaultValue={trip.starts_on ?? ""} />
          <FieldError autosave={autosave} name="starts_on" />
        </div>
        <div className="mb-3">
          <label htmlFor="ends_on">Travel to</label>
          <input id="ends_on" name="ends_on" type="date" defaultValue={trip.ends_on ?? ""} />
          <FieldError autosave={autosave} name="ends_on" />
        </div>
        <div className="mb-3">
          <label htmlFor="nights">Nights</label>
          {/* Calculated by the database from the two dates; each save sends it back. */}
          <output id="nights" name="nights" className="block py-[7px] tabular-nums">{trip.nights ?? "—"}</output>
        </div>
        <div className="mb-3">
          <label htmlFor="adults">Adults</label>
          <input id="adults" name="adults" type="number" min={0} step={1} required defaultValue={trip.adults} />
          <FieldError autosave={autosave} name="adults" />
        </div>
        <div className="mb-3">
          <label htmlFor="children">Children (0–17)</label>
          <input id="children" name="children" type="number" min={0} step={1} required defaultValue={trip.children} />
          <FieldError autosave={autosave} name="children" />
        </div>
      </div>
      {company && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-4">
          <div className="mb-3">
            <label htmlFor="ta_number">TA number</label>
            <input id="ta_number" name="ta_number" type="text" defaultValue={trip.ta_number ?? ""} />
          </div>
          <div className="mb-3">
            <label htmlFor="cost_centre">Cost centre</label>
            <input id="cost_centre" name="cost_centre" type="text" defaultValue={trip.cost_centre ?? ""} />
          </div>
          <div className="mb-3">
            <label htmlFor="authorising_person">Authorising person</label>
            <input id="authorising_person" name="authorising_person" type="text" defaultValue={trip.authorising_person ?? ""} />
          </div>
        </div>
      )}
      <div className="grid grid-cols-3 gap-x-4 max-[900px]:grid-cols-1">
      <div className="mb-3">
        <label htmlFor="visa_info">Visa info</label>
        <textarea id="visa_info" name="visa_info" rows={2} defaultValue={trip.visa_info ?? ""} />
      </div>
      <div className="mb-3">
        <label htmlFor="health_info">Health info</label>
        <textarea id="health_info" name="health_info" rows={2} defaultValue={trip.health_info ?? ""} />
      </div>
      <div className="mb-3">
        <label htmlFor="insurance_info">Insurance info</label>
        <textarea id="insurance_info" name="insurance_info" rows={2} defaultValue={trip.insurance_info ?? ""} />
      </div>
      </div>
      <div className="mb-3">
        <label>Terms profile</label>
        {/* shortcut: only one profile exists, so it is shown, not chosen; add a select with the second profile's wording. */}
        <div>Standard (South Africa, international)</div>
      </div>
      <div className="mb-3">
        <label htmlFor="custom_notes">Custom notes (each line is one extra term on the Quote)</label>
        <textarea id="custom_notes" name="custom_notes" rows={3} defaultValue={trip.custom_notes ?? ""} />
      </div>

      <AutosaveStatus autosave={autosave} />
    </form>
  );
}
