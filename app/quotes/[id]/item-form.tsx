"use client";

import { useActionState, useEffect, useState } from "react";
import { ConfirmButton } from "@/app/confirm-button";
import { TABLE_KIND, type ItemTable } from "@/lib/extraction/tables";
import { rateFor, tenPercent, type FeeRate } from "@/lib/fees";
import { addItem, deleteItem, saveItem, type ItemFormState } from "./item-actions";
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

const str = (v: unknown) => (v == null ? "" : String(v));
const money = (v: unknown) => (typeof v === "number" ? `R${v.toFixed(2)}` : "none");

/** A date or time not in the picker's format stays a text box, so saving never loses it. */
function inputType(field: Field, v: string): string {
  if (field.type === "number") return "number";
  if (field.type === "date") return v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v) ? "date" : "text";
  if (field.type === "time") return v === "" || /^\d{2}:\d{2}$/.test(v) ? "time" : "text";
  return "text";
}

function Input({ field, value, id }: { field: Field; value: unknown; id: string }) {
  const v = str(value);
  if (field.type === "checkbox") return <input id={id} type="checkbox" name={field.name} defaultChecked={value === true} />;
  if (field.type === "textarea") return <textarea id={id} name={field.name} rows={2} defaultValue={v} />;
  if (field.type === "select") {
    return (
      <select id={id} name={field.name} defaultValue={v}>
        {field.options?.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
      </select>
    );
  }
  return <input id={id} type={inputType(field, v)} name={field.name} defaultValue={v} step={field.type === "number" ? "any" : undefined} />;
}

/** Flights inside a Flight option: drag a row to move it, or edit its direction and position numbers. */
function FlightsTable({ initial, formId }: { initial: Row[]; formId: string }) {
  const [list, setList] = useState<Row[]>(initial);
  const [dragged, setDragged] = useState<number | null>(null);

  const update = (i: number, name: string, value: unknown) =>
    setList((l) => l.map((f, j) => (j === i ? { ...f, [name]: value } : f)));

  // Dropping takes the target's direction, then positions follow the order on screen.
  function drop(target: number) {
    if (dragged === null || dragged === target) return;
    setList((l) => {
      const next = [...l];
      const [moved] = next.splice(dragged, 1);
      next.splice(target, 0, { ...moved, direction_no: l[target].direction_no, direction_label: l[target].direction_label });
      return renumber(next);
    });
    setDragged(null);
  }

  return (
    <div className="flights">
      <input type="hidden" name="flights" value={JSON.stringify(sorted(list))} form={formId} />
      <table>
        <thead>
          <tr>
            <th aria-label="Drag to reorder" />
            {FLIGHT_FIELDS.map((f) => <th key={f.name}>{f.label}</th>)}
            <th />
          </tr>
        </thead>
        <tbody>
          {list.map((f, i) => (
            <tr
              key={i}
              draggable
              onDragStart={() => setDragged(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop(i)}
              className={dragged === i ? "dragging" : undefined}
            >
              <td className="handle" title="Drag to reorder">⋮⋮</td>
              {FLIGHT_FIELDS.map((field) => (
                <td key={field.name}>
                  {field.type === "checkbox" ? (
                    <input
                      type="checkbox"
                      aria-label={field.label}
                      checked={f[field.name] === true}
                      onChange={(e) => update(i, field.name, e.target.checked)}
                    />
                  ) : (
                    <input
                      type={inputType(field, str(f[field.name]))}
                      aria-label={field.label}
                      value={str(f[field.name])}
                      onChange={(e) => update(i, field.name, field.type === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value)}
                    />
                  )}
                </td>
              ))}
              <td>
                <button type="button" className="danger" onClick={() => setList((l) => renumber(l.filter((_, j) => j !== i)))}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="link"
        onClick={() =>
          setList((l) => {
            const last = l[l.length - 1];
            return [...l, { direction_no: last?.direction_no ?? 1, direction_label: last?.direction_label ?? "", seq: l.length + 1, next_day: false }];
          })
        }
      >
        + Add flight
      </button>
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
  flights,
  stays,
  rates,
}: {
  quoteId: string;
  table: ItemTable;
  row: Row;
  flights?: Row[];
  stays: StayOption[];
  rates: FeeRate[];
}) {
  const id = String(row.id);
  const formId = `item-${id}`;
  const kind = TABLE_KIND[table];
  const [state, action, pending] = useActionState<ItemFormState, FormData>(
    saveItem.bind(null, quoteId, table, id),
    {},
  );
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (state.notice) setDirty(false);
  }, [state]);
  // shortcut: warns on reload or closing the tab only, not on in-app links; add a router guard if edits get lost that way.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const rate = rateFor(rates, kind, row.fee_region, row.variant);
  const suggestion = kind === "car_rental" && row.prepaid ? tenPercent(row.price, rate?.prepayment_fee) : null;

  return (
    <form id={formId} action={action} className="card item-form" onChange={() => setDirty(true)}>
      <div className="item-head">
        <b>{ITEM_LABEL[table]}</b>
        {dirty && <span className="badge">Not saved</span>}
      </div>

      <div className="item-grid">
        {ITEM_FIELDS[table].map((f) => (
          <div className="field" key={f.name}>
            <label htmlFor={`${formId}-${f.name}`}>{f.label}</label>
            <Input field={f} value={row[f.name]} id={`${formId}-${f.name}`} />
          </div>
        ))}
        {table === "accommodation_options" && (
          <div className="field">
            <label htmlFor={`${formId}-stay`}>Stay</label>
            <select id={`${formId}-stay`} name="stay_id" defaultValue={str(row.stay_id)}>
              <option value="">Not placed</option>
              {stays.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        )}
      </div>

      {flights && <FlightsTable initial={flights} formId={formId} />}

      <div className="item-grid">
        {PRICE_FIELDS.map((f) => (
          <div className="field" key={f.name}>
            <label htmlFor={`${formId}-${f.name}`}>{f.label}</label>
            <Input field={f} value={row[f.name]} id={`${formId}-${f.name}`} />
            {f.name === "price" && row.price_note != null && <small className="warn">{str(row.price_note)}</small>}
          </div>
        ))}
        <div className="field">
          <label htmlFor={`${formId}-region`}>Fee region</label>
          <select id={`${formId}-region`} name="fee_region" defaultValue={str(row.fee_region)}>
            {REGION_OPTIONS.filter(([v]) => kind === "flight" || v !== "local_international").map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
        </div>
        {kind === "flight" && (
          <div className="field">
            <label htmlFor={`${formId}-variant`}>Fare type</label>
            <select id={`${formId}-variant`} name="variant" defaultValue={str(row.variant)}>
              {VARIANT_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </div>
        )}
        {FEE_LABELS.map(([name, label]) => (
          <div className="field" key={name}>
            <label htmlFor={`${formId}-${name}`}>{label} (R)</label>
            <input id={`${formId}-${name}`} type="number" step="any" name={name} defaultValue={str(row[name])} />
            <small>Schedule: {money(rate?.[name as keyof FeeRate])}</small>
          </div>
        ))}
        {kind === "car_rental" && (
          <div className="field">
            <label>
              <input type="checkbox" name="ten_percent_fee" defaultChecked={row.ten_percent_fee === true} /> Use 10% pre-payment fee
            </label>
            {suggestion != null && <small className="warn">Suggested: 10% = R{suggestion.toFixed(2)}</small>}
          </div>
        )}
      </div>

      <div className="item-actions">
        <button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        <ConfirmButton className="danger" formAction={deleteItem.bind(null, quoteId, table, id)} confirmLabel="Sure? This cannot be undone">
          Delete
        </ConfirmButton>
        {state.error && <span className="msg error">{state.error}</span>}
        {state.notice && !dirty && <span className="msg">{state.notice}</span>}
      </div>
    </form>
  );
}

export function AddItemForm({ quoteId }: { quoteId: string }) {
  return (
    <form action={addItem.bind(null, quoteId)} className="inline-form">
      <label htmlFor="add-item-kind">Add by hand</label>
      <select id="add-item-kind" name="table" defaultValue="flight_options">
        {(Object.keys(ITEM_LABEL) as ItemTable[]).map((t) => <option key={t} value={t}>{ITEM_LABEL[t]}</option>)}
      </select>
      <button type="submit">Add</button>
    </form>
  );
}
