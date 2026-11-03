"use client";

import { AutosaveStatus, useAutosave } from "@/app/autosave";
import { saveCheck } from "./checklist-actions";

export const CHECKS: [string, string][] = [
  ["visa", "Visa and entry requirements"],
  ["health", "Health advice"],
  ["insurance", "Insurance decision"],
  ["details", "Traveller details checked with the supplier"],
  ["seats_meals", "Seats and meals requested"],
  ["documents", "Documents sent"],
];

export type CheckRow = { check_key: string; done_at: string | null; done_by: string | null; note: string | null };

function Check({ tripId, checkKey, label, row, who, readOnly }: { tripId: string; checkKey: string; label: string; row?: CheckRow; who: string | null; readOnly: boolean }) {
  const autosave = useAutosave({ key: `${tripId}-${checkKey}`, label, save: (fd) => saveCheck(tripId, checkKey, fd) });
  return (
    <form ref={autosave.formRef} className="grid grid-cols-[minmax(0,1fr)_2fr] items-start gap-x-4 border-t border-line py-2 first:border-t-0 max-[700px]:grid-cols-1">
      <button type="submit" disabled hidden aria-hidden="true" />
      <div>
        <label className="flex items-center gap-2 font-semibold">
          <input type="checkbox" name="done" defaultChecked={!!row?.done_at} disabled={readOnly} />
          {label}
        </label>
        {row?.done_at && (
          <small className="block text-xs text-muted">
            Ticked by {who ?? "someone"}, {new Date(row.done_at).toLocaleDateString("en-ZA")}
          </small>
        )}
      </div>
      <div>
        <input type="text" name="note" aria-label={`${label}: note`} placeholder="Note" defaultValue={row?.note ?? ""} disabled={readOnly} />
        <AutosaveStatus autosave={autosave} />
      </div>
    </form>
  );
}

/** The Trip's checklist; each check saves as you tick or leave its note. Accountants see it read-only (ADR 0010). */
export function Checklist({ tripId, rows, names, readOnly }: { tripId: string; rows: CheckRow[]; names: Record<string, string>; readOnly: boolean }) {
  return (
    <section aria-label="Trip checklist" className="mb-6 rounded-md border border-line bg-white px-5 py-2">
      {CHECKS.map(([key, label]) => {
        const row = rows.find((r) => r.check_key === key);
        // Remount when the saved tick changes so "Ticked by" and the box stay in step.
        return <Check key={`${key}-${row?.done_at ?? ""}`} tripId={tripId} checkKey={key} label={label} row={row} who={row?.done_by ? (names[row.done_by] || null) : null} readOnly={readOnly} />;
      })}
    </section>
  );
}
