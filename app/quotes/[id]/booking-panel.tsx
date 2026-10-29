"use client";

import { useActionState, useId, useState } from "react";
import { ConfirmButton } from "@/app/confirm-button";
import { cancellationFee, changeTotal } from "@/lib/booking";
import { addChange, bookItem, correctBooking, markIssued, unbookItem, type BookingFormState } from "./booking-actions";

type Row = Record<string, unknown>;
export type Booking = Row & { supplier: string };

const str = (v: unknown) => (v == null ? "" : String(v));
const rand = (n: number) => `R${n.toFixed(2)}`;

function Message({ state }: { state: BookingFormState }) {
  if (state.error) return <div className="msg error">{state.error}</div>;
  if (state.notice) return <div className="msg">{state.notice}</div>;
  return null;
}

function Text({ label, name, value, type = "text", required }: { label: string; name: string; value?: unknown; type?: string; required?: boolean }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} type={type} step={type === "number" ? "0.01" : undefined} defaultValue={str(value)} required={required} />
    </div>
  );
}

/** Currency, preselected as Rand, and the rate to Rand, which Rand does not need. */
function CurrencyRate({ currency, rate }: { currency?: unknown; rate?: unknown }) {
  const [cur, setCur] = useState(str(currency) || "ZAR");
  const id = useId();
  const isRand = cur.trim().toUpperCase() === "ZAR";
  return (
    <>
      <div className="field">
        <label htmlFor={id}>Currency</label>
        <input id={id} name="currency" value={cur} onChange={(e) => setCur(e.target.value)} maxLength={3} size={4} required />
      </div>
      {!isRand && <Text label="Rate to Rand" name="rate" type="number" value={rate} required />}
    </>
  );
}

function BookingFields({ booking, suppliers, flight }: { booking?: Booking; suppliers: string[]; flight: boolean }) {
  const listId = useId();
  return (
    <div className="row-fields">
      <div className="field">
        <label htmlFor={`${listId}-s`}>Supplier</label>
        <input id={`${listId}-s`} name="supplier" list={listId} defaultValue={booking?.supplier} required placeholder="e.g. XL Ticketing" />
        <datalist id={listId}>{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
      </div>
      <Text label="Booking reference" name="booking_reference" value={booking?.booking_reference} required />
      <CurrencyRate currency={booking?.currency} rate={booking?.rate} />
      <Text label="Supplier amount" name="amount" type="number" value={booking?.amount} required />
      <Text label="Supplier invoice expected" name="expected_invoice_on" type="date" value={booking?.expected_invoice_on} required />
      {flight && <Text label="Ticket numbers (comma separated)" name="ticket_numbers" value={(booking?.ticket_numbers as string[] | undefined)?.join(", ")} />}
      <Text label="Notes" name="notes" value={booking?.notes} />
    </div>
  );
}

function ChangeForm({ quoteId, entityId, kind, item, issued }: { quoteId: string; entityId: string; kind: "change" | "cancellation"; item: Row; issued: boolean }) {
  const [state, action, pending] = useActionState(addChange.bind(null, quoteId, entityId, kind), {});
  const cancel = kind === "cancellation";
  return (
    <details>
      <summary>{cancel ? "Cancel this Item" : "+ Record a Change"}</summary>
      <form action={action}>
        <div className="row-fields">
          <Text label="Date" name="happened_on" type="date" value={new Date().toISOString().slice(0, 10)} required />
          <Text label="What happened" name="description" />
          <CurrencyRate />
          {!cancel && <Text label="Extra fare" name="extra_fare" type="number" />}
          {!cancel && <Text label="Extra taxes" name="extra_taxes" type="number" />}
          <Text label="Supplier penalty" name="supplier_penalty" type="number" />
          <Text
            label={cancel ? (issued ? "Refund fee (R)" : "Transaction fee (R)") : "Change fee (R)"}
            name="agency_fee"
            type="number"
            value={cancel ? cancellationFee(item, issued) : item.change_fee}
          />
          {!cancel && <Text label="Markup (R)" name="markup" type="number" />}
          {cancel && <Text label="Refund expected from the Supplier" name="expected_refund" type="number" />}
          <Text label="Supplier invoice expected" name="expected_invoice_on" type="date" />
        </div>
        <button type="submit" className={cancel ? "danger" : undefined} disabled={pending}>
          {cancel ? "Record the Cancellation" : "Record the Change"}
        </button>
        <Message state={state} />
      </form>
    </details>
  );
}

/**
 * Booking an Item and what happens to it afterwards: Corrections, issuing, Changes and the
 * Cancellation (GLOSSARY, ADR 0011). Shown under the Item's card.
 */
export function BookingPanel({
  quoteId,
  entityId,
  kind,
  item,
  booking,
  changes,
  suppliers,
  readOnly,
}: {
  quoteId: string;
  entityId: string;
  kind: string;
  item: Row;
  booking: Booking | null;
  changes: Row[];
  suppliers: string[];
  readOnly: boolean;
}) {
  const flight = kind === "flight";
  const [bookState, book, bookPending] = useActionState(bookItem.bind(null, quoteId, entityId, kind), {});
  const [fixState, fix, fixing] = useActionState(correctBooking.bind(null, quoteId, entityId), {});
  const [issueState, issue, issuing] = useActionState(markIssued.bind(null, quoteId, entityId, kind), {});
  const [unbookState, unbook] = useActionState(unbookItem.bind(null, quoteId, entityId), {});

  if (!booking) {
    if (readOnly) return null;
    return (
      <details className="booking">
        <summary>Book this Item</summary>
        <form action={book}>
          <BookingFields suppliers={suppliers} flight={flight} />
          <label>
            <input type="checkbox" name="issued" /> Already issued
          </label>
          <button type="submit" disabled={bookPending}>Book</button>
          <Message state={bookState} />
        </form>
      </details>
    );
  }

  const issued = booking.issued_at != null;
  const cancelled = changes.some((c) => c.kind === "cancellation");
  const amount = Number(booking.amount);
  const rate = Number(booking.rate);

  return (
    <section className="booking card">
      <div className="item-head">
        <b>Booked</b> with {booking.supplier} · {str(booking.booking_reference)} · {str(booking.currency)} {amount.toFixed(2)}
        {booking.currency !== "ZAR" && ` at ${rate} = ${rand(amount * rate)}`} · Supplier invoice expected {str(booking.expected_invoice_on)}
        {issued && <span className="badge ok">Issued</span>}
        {cancelled && <span className="badge bad">Cancelled</span>}
      </div>
      {flight && Array.isArray(booking.ticket_numbers) && booking.ticket_numbers.length > 0 && (
        <small>Tickets: {(booking.ticket_numbers as string[]).join(", ")}</small>
      )}

      {changes.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>What</th>
              <th>Supplier charges</th>
              <th>Agency fee</th>
              <th>Markup</th>
              <th>Client pays</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((c) => {
              const charges = Number(c.extra_fare) + Number(c.extra_taxes) + Number(c.supplier_penalty);
              return (
                <tr key={str(c.id)}>
                  <td>{str(c.happened_on)}</td>
                  <td>
                    {c.kind === "cancellation" ? "Cancellation" : "Change"}
                    {c.description ? `: ${str(c.description)}` : ""}
                    {c.kind === "cancellation" && Number(c.expected_refund) > 0 && <small> · refund expected {rand(Number(c.expected_refund))}</small>}
                  </td>
                  <td>
                    {str(c.currency)} {charges.toFixed(2)}
                  </td>
                  <td>{rand(Number(c.agency_fee))}</td>
                  <td>{rand(Number(c.markup))}</td>
                  <td>{rand(changeTotal(c as Parameters<typeof changeTotal>[0]))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {!readOnly && (
        <>
          <details>
            <summary>Correct booking details</summary>
            <form action={fix}>
              <BookingFields booking={booking} suppliers={suppliers} flight={flight} />
              <button type="submit" disabled={fixing}>Save the Correction</button>
              <Message state={fixState} />
            </form>
          </details>
          {!issued && !cancelled && (
            <form action={issue} className="inline-form">
              {flight && <input name="ticket_numbers" aria-label="Ticket numbers" placeholder="Ticket numbers, comma separated" defaultValue={(booking.ticket_numbers as string[]).join(", ")} />}
              <button type="submit" disabled={issuing}>Mark issued</button>
              <Message state={issueState} />
            </form>
          )}
          {!cancelled && <ChangeForm quoteId={quoteId} entityId={entityId} kind="change" item={item} issued={issued} />}
          {!cancelled && <ChangeForm quoteId={quoteId} entityId={entityId} kind="cancellation" item={item} issued={issued} />}
          {changes.length === 0 && (
            <form action={unbook} className="inline-form">
              <ConfirmButton className="danger" confirmLabel="Sure? Only if it was booked by mistake">
                Unbook
              </ConfirmButton>
              <Message state={unbookState} />
            </form>
          )}
        </>
      )}
    </section>
  );
}
