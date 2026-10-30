"use client";

import { useRef, useState } from "react";
import { AutosaveStatus, FieldError, useAutosave } from "@/app/autosave";
import { ConfirmButton } from "@/app/confirm-button";
import { FileLink } from "@/app/file-viewer";
import { Button } from "@/app/ui";
import { TABLE_KIND, type ItemTable } from "@/lib/extraction/tables";
import { rateFor, tenPercent, type FeeRate } from "@/lib/fees";
import { addItem, deleteItem, saveItem } from "./item-actions";
import {
  FEE_LABELS,
  FLIGHT_FIELDS,
  ITEM_FIELDS,
  ITEM_LABEL,
  PRICE_FIELDS,
  REGION_OPTIONS,
  VARIANT_OPTIONS,
  type Field,
} from "./item-fields";

type Row = Record<string, unknown>;
export type StayOption = { id: string; label: string };
/** The Source image an Item was read from; none for a Manual Capture. */
export type ItemSource = { filename: string; url?: string } | null;

const str = (v: unknown) => (v == null ? "" : String(v));
const money = (v: unknown) => (typeof v === "number" ? `R${v.toFixed(2)}` : "none");

const GRID = "grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-x-3";
const HINT = "mt-0.5 block text-[11px] text-muted";

/** A date or time not in the picker's format stays a text box, so saving never loses it. */
function inputType(field: Field, v: string): string {
  if (field.type === "number" || field.type === "money") return "number";
  if (field.type === "date") return v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v) ? "date" : "text";
  if (field.type === "time") return v === "" || /^\d{2}:\d{2}$/.test(v) ? "time" : "text";
  return "text";
}

function Input({ field, value, id }: { field: Field; value: unknown; id: string }) {
  const v = str(value);
  if (field.type === "checkbox") return <input id={id} type="checkbox" name={field.name} defaultChecked={value === true} />;
  // Grows with its text, and resizes only downward so it never covers its neighbours.
  if (field.type === "textarea") return <textarea id={id} name={field.name} rows={4} defaultValue={v} className="min-h-[6.5em] resize-y [field-sizing:content]" />;
  if (field.type === "select") {
    return (
      <select id={id} name={field.name} defaultValue={v}>
        {field.options?.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
      </select>
    );
  }
  return <input id={id} type={inputType(field, v)} name={field.name} defaultValue={v} step={field.type === "money" ? "0.01" : field.type === "number" ? "any" : undefined} />;
}

/** One line per flight, e.g. "SA 343  JNB → CPT  2026-03-12, 22:15–06:40, arrives next day". */
function flightLine(f: Row) {
  const route = [str(f.from_code) || str(f.from_city), str(f.to_code) || str(f.to_city)].filter(Boolean).join(" → ");
  const times = [str(f.departs), str(f.arrives)].filter(Boolean).join("–");
  return {
    flight: [str(f.airline), str(f.flight_no)].filter(Boolean).join(" ") || "New flight",
    route: route || "Route to fill in",
    when: [str(f.date), times].filter(Boolean).join(", ") + (f.next_day ? ", arrives next day" : ""),
  };
}

/**
 * The flights inside a Flight option, grouped by Direction; each opens in a dialog to edit.
 * The whole list saves as one field whenever the dialog closes (Done, Remove, Esc or a click outside).
 */
function FlightList({ idPrefix, initial, frozen, onChange }: { idPrefix: string; initial: Row[]; frozen: boolean; onChange: (json: string) => void }) {
  const [list, setListState] = useState<Row[]>(() => sorted(initial));
  const [editing, setEditing] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const lastSent = useRef(JSON.stringify(sorted(initial)));
  // The close event can arrive before React re-renders, so it saves from here, never from a stale render.
  const latest = useRef(list);
  const setList = (next: Row[]) => {
    latest.current = next;
    setListState(next);
  };

  function save() {
    const tidy = sorted(latest.current);
    setList(tidy);
    setEditing(null);
    const json = JSON.stringify(tidy);
    if (json === lastSent.current) return;
    lastSent.current = json;
    onChange(json);
  }

  const open = (i: number) => {
    setEditing(i);
    dialog.current?.showModal();
  };
  const update = (name: string, value: unknown) =>
    setList(latest.current.map((f, j) => (j === editing ? { ...f, [name]: value } : f)));

  function add() {
    const last = list[list.length - 1];
    const next = [...list, { direction_no: last?.direction_no ?? 1, direction_label: last?.direction_label ?? "", seq: 999, next_day: false }];
    setList(next);
    open(next.length - 1);
  }

  const directions = [...new Set(list.map((f) => Number(f.direction_no) || 1))];
  const current = editing === null ? null : list[editing];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <b>Flights</b>
        {!frozen && (
          <Button variant="quiet" className="font-semibold text-teal-deep" onClick={add}>
            Add flight
          </Button>
        )}
      </div>
      {list.length === 0 && <p className="text-muted">{frozen ? "No flights." : "No flights yet. Add each flight of this option, outbound and return."}</p>}
      {directions.map((d) => {
        const flights = list.map((f, i) => ({ f, i })).filter(({ f }) => (Number(f.direction_no) || 1) === d);
        return (
          <div key={d} className="mb-3">
            <p className="mb-1 text-xs font-semibold text-muted">{str(flights[0].f.direction_label) || `Direction ${d}`}</p>
            <ul className="overflow-hidden rounded border border-line">
              {flights.map(({ f, i }) => {
                const l = flightLine(f);
                return (
                  <li key={i} className="border-t border-line first:border-t-0">
                    <button
                      type="button"
                      onClick={() => open(i)}
                      className="grid w-full grid-cols-[6rem_1fr_auto] items-baseline gap-3 rounded-none bg-white px-3 py-2 text-left font-normal text-ink hover:bg-paper"
                    >
                      <span className="font-semibold">{l.flight}</span>
                      <span>{l.route}</span>
                      <span className="text-muted tabular-nums">{l.when}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <dialog
        ref={dialog}
        aria-label="Edit flight"
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
        onClose={save}
        className="m-auto w-[min(860px,94vw)] rounded-md border border-line bg-white p-5 backdrop:bg-ink/60"
      >
        {current && (
          <>
            <div className="mb-4 flex items-center justify-between gap-3">
              <b className="font-display text-xl font-normal">{flightLine(current).flight}</b>
              <Button variant="quiet" aria-label="Close" className="text-xl leading-none" onClick={() => dialog.current?.close()}>
                ✕
              </Button>
            </div>
            <div className={GRID}>
              {FLIGHT_FIELDS.map((field) => (
                <div key={field.name} className="mb-3">
                  <label htmlFor={`${idPrefix}-${field.name}`}>{field.name === "direction_no" ? "Direction no." : field.name === "seq" ? "Position" : field.label}</label>
                  {field.type === "checkbox" ? (
                    <input
                      id={`${idPrefix}-${field.name}`}
                      type="checkbox"
                      disabled={frozen}
                      checked={current[field.name] === true}
                      onChange={(e) => update(field.name, e.target.checked)}
                    />
                  ) : (
                    <input
                      // No name, so the Item's autosave ignores it; the list saves as one field instead.
                      id={`${idPrefix}-${field.name}`}
                      disabled={frozen}
                      type={inputType(field, str(current[field.name]))}
                      value={str(current[field.name])}
                      onChange={(e) => update(field.name, field.type === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-4">
              <button type="button" onClick={() => dialog.current?.close()}>
                {frozen ? "Close" : "Done"}
              </button>
              {!frozen && (
                <Button
                  variant="danger"
                  onClick={() => {
                    setList(latest.current.filter((_, j) => j !== editing));
                    dialog.current?.close();
                  }}
                >
                  Remove flight
                </Button>
              )}
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}

/** By direction, then position, then screen order. */
function sorted(list: Row[]): Row[] {
  return renumber(
    list
      .map((f, i) => ({ f, i }))
      .sort((a, b) => Number(a.f.direction_no) - Number(b.f.direction_no) || Number(a.f.seq) - Number(b.f.seq) || a.i - b.i)
      .map(({ f }) => f),
  );
}

/** Positions 1, 2, 3 ... within each direction, in list order. */
function renumber(list: Row[]): Row[] {
  const seen = new Map<unknown, number>();
  return list.map((f) => {
    const n = (seen.get(f.direction_no) ?? 0) + 1;
    seen.set(f.direction_no, n);
    return { ...f, seq: n };
  });
}

export function ItemForm({
  quoteId,
  table,
  row,
  source,
  flights,
  stays,
  rates,
  lastOfImage = false,
  booked = false,
  locked = false,
  readOnly = false,
}: {
  quoteId: string;
  table: ItemTable;
  row: Row;
  source: ItemSource;
  flights?: Row[];
  stays: StayOption[];
  rates: FeeRate[];
  /** The only Item left from its image, so deleting it removes the image too. */
  lastOfImage?: boolean;
  /** Booked Items are never deleted; unbook first. */
  booked?: boolean;
  /** Booked, and the User is not an Administrator: only Corrections in the booking panel (ADR 0011). */
  locked?: boolean;
  /** Accountants see Items but cannot change them (ADR 0010). */
  readOnly?: boolean;
}) {
  const id = String(row.id);
  // Only the fields go in the disabled fieldset; it would disable the image link and the flights' dialogs too.
  const frozen = locked || readOnly;
  const formId = `item-${id}`;
  const kind = TABLE_KIND[table];
  const autosave = useAutosave({
    key: id,
    label: `${ITEM_LABEL[table]}: ${str(row[ITEM_FIELDS[table][0].name]) || "untitled"}`,
    save: (fd) => saveItem(quoteId, table, id, fd),
  });

  const rate = rateFor(rates, kind, row.fee_region, row.variant);
  const suggestion = kind === "car_rental" && row.prepaid ? tenPercent(row.price, rate?.prepayment_fee) : null;

  const fields = (
    <>
      <div className={GRID}>
        {ITEM_FIELDS[table].map((f) => (
          <div className={f.type === "textarea" ? "col-span-full mb-3" : "mb-3"} key={f.name}>
            <label htmlFor={`${formId}-${f.name}`}>{f.label}</label>
            <Input field={f} value={row[f.name]} id={`${formId}-${f.name}`} />
            <FieldError autosave={autosave} name={f.name} />
          </div>
        ))}
        {table === "accommodation_options" && (
          <div className="mb-3">
            <label htmlFor={`${formId}-stay`}>Stay</label>
            <select id={`${formId}-stay`} name="stay_id" defaultValue={str(row.stay_id)}>
              <option value="">Not placed</option>
              {stays.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className={GRID}>
        {PRICE_FIELDS.map((f) => (
          <div className={f.type === "textarea" ? "col-span-full mb-3" : "mb-3"} key={f.name}>
            <label htmlFor={`${formId}-${f.name}`}>{f.label}</label>
            <Input field={f} value={row[f.name]} id={`${formId}-${f.name}`} />
            {f.name === "price" && row.price_note != null && <small className={`${HINT} text-danger`}>{str(row.price_note)}</small>}
            <FieldError autosave={autosave} name={f.name} />
          </div>
        ))}
        <div className="mb-3">
          <label htmlFor={`${formId}-region`}>Fee region</label>
          <select id={`${formId}-region`} name="fee_region" defaultValue={str(row.fee_region)}>
            {REGION_OPTIONS.filter(([v]) => kind === "flight" || v !== "local_international").map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
        </div>
        {kind === "flight" && (
          <div className="mb-3">
            <label htmlFor={`${formId}-variant`}>Fare type</label>
            <select id={`${formId}-variant`} name="variant" defaultValue={str(row.variant)}>
              {VARIANT_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </div>
        )}
        {FEE_LABELS.map(([name, label]) => (
          <div className="mb-3" key={name}>
            <label htmlFor={`${formId}-${name}`}>{label} (R)</label>
            <input id={`${formId}-${name}`} type="number" step="0.01" name={name} defaultValue={str(row[name])} />
            <small className={HINT}>Schedule: {money(rate?.[name as keyof FeeRate])}</small>
            <FieldError autosave={autosave} name={name} />
          </div>
        ))}
        {kind === "car_rental" && (
          <div className="mb-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="ten_percent_fee" defaultChecked={row.ten_percent_fee === true} /> Use 10% pre-payment fee
            </label>
            {suggestion != null && <small className={`${HINT} text-danger`}>Suggested: 10% = R{suggestion.toFixed(2)}</small>}
          </div>
        )}
      </div>
    </>
  );

  return (
    <form id={formId} ref={autosave.formRef} className="rounded-md border border-line bg-white p-4">
      {/* Enter in a text box submits with the first submit button; this one does nothing, so Enter never arms Delete. */}
      <button type="submit" disabled hidden aria-hidden="true" />
        <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <b>{ITEM_LABEL[table]}</b>
          {source?.url ? (
            <FileLink href={source.url} title={source.filename} image className="text-[13px]">
              From {source.filename}
            </FileLink>
          ) : (
            <span className="text-[13px] text-muted">{source ? `From ${source.filename}` : "Manually added"}</span>
          )}
        </div>

        {flights ? (
          // Flight option: its own fields on the left, its flights on the right.
          <div className="grid grid-cols-2 gap-6 max-[900px]:grid-cols-1">
            <fieldset className="min-w-0" disabled={frozen}>{fields}</fieldset>
            <div className="min-w-0">
              <FlightList idPrefix={formId} initial={flights} frozen={frozen} onChange={(json) => autosave.change("flights", json)} />
              <FieldError autosave={autosave} name="flights" />
            </div>
          </div>
        ) : (
          <fieldset className="min-w-0" disabled={frozen}>{fields}</fieldset>
        )}
      <div className="mt-1 flex flex-wrap items-center gap-3.5">
        {booked && <small>{locked ? "Booked: only an administrator can edit it." : "Booked: edits are Corrections."}</small>}
        {!booked && !readOnly && (
          <ConfirmButton
            formAction={deleteItem.bind(null, quoteId, table, id)}
            confirmLabel={lastOfImage ? "Sure? This also removes the image" : "Sure? This cannot be undone"}
          >
            Delete
          </ConfirmButton>
        )}
        <AutosaveStatus autosave={autosave} />
      </div>
    </form>
  );
}

export function AddItemForm({ quoteId, table }: { quoteId: string; table: ItemTable }) {
  return (
    <form action={addItem.bind(null, quoteId)}>
      <input type="hidden" name="table" value={table} />
      <button type="submit">Manual Capture</button>
    </form>
  );
}
