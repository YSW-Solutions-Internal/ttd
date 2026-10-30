"use client";

import { useActionState, useId, useState } from "react";
import { ConfirmButton } from "@/app/confirm-button";
import { cancellationFee, changeTotal } from "@/lib/booking";
import { STAGE_LABEL, STATUS_LABEL } from "@/lib/invoicing";
import type { Billable } from "@/app/trips/[id]/invoicing-data";
import { addChange, bookItem, correctBooking, markIssued, unbookItem, type BookingFormState } from "./booking-actions";
import { FileLink } from "@/app/file-viewer";
import { Badge, Msg } from "@/app/ui";

type Row = Record<string, unknown>;
export type Booking = Row & { supplier: string };

const str = (v: unknown) => (v == null ? "" : String(v));
const rand = (n: number) => `R${n.toFixed(2)}`;

function Message({ state }: { state: BookingFormState }) {
  if (state.error) return <Msg tone="error">{state.error}</Msg>;
  if (state.notice) return <Msg>{state.notice}</Msg>;
  return null;
}

function Text({ label, name, value, type = "text", required }: { label: string; name: string; value?: unknown; type?: string; required?: boolean }) {
  const id = useId();
  return (
    <div className="mb-3 min-w-[150px] flex-1">
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
      <div className="mb-3 min-w-[150px] flex-1">
        <label htmlFor={id}>Currency</label>
        <input id={id} type="text" name="currency" value={cur} onChange={(e) => setCur(e.target.value)} maxLength={3} size={4} required />
      </div>
      {!isRand && <Text label="Rate to Rand" name="rate" type="number" value={rate} required />}
    </>
  );
}

function BookingFields({ booking, suppliers, flight }: { booking?: Booking; suppliers: string[]; flight: boolean }) {
  const listId = useId();
  return (
    <div className="flex flex-wrap items-end gap-x-3">
      <div className="mb-3 min-w-[150px] flex-1">
        <label htmlFor={`${listId}-s`}>Supplier</label>
        <input id={`${listId}-s`} type="text" name="supplier" list={listId} defaultValue={booking?.supplier} required placeholder="e.g. XL Ticketing" />
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
    <details className="rounded-md border border-dashed border-field bg-white px-4 py-3 open:border-solid open:border-line">
      <summary className={cancel ? "cursor-pointer font-semibold text-danger" : "cursor-pointer font-semibold text-teal-deep"}>{cancel ? "Cancel this Item" : "Record a Change"}</summary>
      <form action={action} className="mt-3">
        <div className="flex flex-wrap items-end gap-x-3">
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
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={cancel ? "bg-danger hover:bg-ink" : undefined} disabled={pending}>
            {cancel ? "Record the Cancellation" : "Record the Change"}
          </button>
          <Message state={state} />
        </div>
      </form>
    </details>
  );
}

/** An Item's or Change's Invoicing stage, what is still to invoice, and its linked invoices (display only). */
function Invoicing({ b }: { b?: Billable }) {
  if (!b) return null;
  return (
    <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px]">
      <Badge tone={b.stage === "invoiced" || b.stage === "none_expected" ? "teal" : "neutral"}>{STAGE_LABEL[b.stage]}</Badge>
      {b.toInvoice !== 0 && <span className="tabular-nums">{rand(b.toInvoice)} still to invoice</span>}
      {b.links.map((l) => (
        <span key={l.linkId} className="tabular-nums">
          {l.side === "supplier" ? "Supplier" : "Client"} {l.amount < 0 ? "credit note" : "invoice"} {l.number}: {l.currency} {l.amount.toFixed(2)}
          {l.status && ` (${STATUS_LABEL[l.status]})`}
          {l.url && (
            <>
              {" "}
              <FileLink href={l.url} title={`${l.side === "supplier" ? "Supplier" : "Client"} ${l.amount < 0 ? "credit note" : "invoice"} ${l.number}`}>
                PDF
              </FileLink>
            </>
          )}
        </span>
      ))}
    </div>
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
  billing,
  readOnly,
}: {
  quoteId: string;
  entityId: string;
  kind: string;
  item: Row;
  booking: Booking | null;
  changes: Row[];
  suppliers: string[];
  billing: Billable[];
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
      <details className="mt-2 rounded-md border border-dashed border-field bg-white px-4 py-3 open:border-solid open:border-line">
        <summary className="cursor-pointer font-semibold text-teal-deep">Book this Item</summary>
        <form action={book} className="mt-3">
          <BookingFields suppliers={suppliers} flight={flight} />
          <div className="flex flex-wrap items-center gap-4">
            <label className="mb-0 flex items-center gap-2 font-normal">
              <input type="checkbox" name="issued" /> Already issued
            </label>
            <button type="submit" disabled={bookPending}>Book</button>
            <Message state={bookState} />
          </div>
        </form>
      </details>
    );
  }

  const issued = booking.issued_at != null;
  const cancelled = changes.some((c) => c.kind === "cancellation");
  const amount = Number(booking.amount);
  const rate = Number(booking.rate);

  return (
    <section className="mt-2 flex flex-col gap-3 rounded-md border border-teal/50 bg-white p-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <b>Booked with {booking.supplier}</b>
        <span>Ref {str(booking.booking_reference)}</span>
        <span className="font-semibold tabular-nums">
          {str(booking.currency)} {amount.toFixed(2)}
          {booking.currency !== "ZAR" && ` at ${rate} = ${rand(amount * rate)}`}
        </span>
        <span className="text-muted">Supplier invoice expected {str(booking.expected_invoice_on)}</span>
        {issued && <Badge tone="tealSolid">Issued</Badge>}
        {cancelled && <Badge tone="danger">Cancelled</Badge>}
      </div>
      {flight && Array.isArray(booking.ticket_numbers) && booking.ticket_numbers.length > 0 && (
        <p className="text-[13px]">Tickets: {(booking.ticket_numbers as string[]).join(", ")}</p>
      )}
      <Invoicing b={billing.find((b) => b.changeId === null)} />

      {changes.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>What</th>
              <th className="text-right">Supplier charges</th>
              <th className="text-right">Agency fee</th>
              <th className="text-right">Markup</th>
              <th className="text-right">Client pays</th>
              <th>Invoicing</th>
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
                    {c.kind === "cancellation" && Number(c.expected_refund) > 0 && <small className="block text-muted">Refund expected {rand(Number(c.expected_refund))}</small>}
                  </td>
                  <td className="text-right">
                    {str(c.currency)} {charges.toFixed(2)}
                  </td>
                  <td className="text-right">{rand(Number(c.agency_fee))}</td>
                  <td className="text-right">{rand(Number(c.markup))}</td>
                  <td className="text-right font-semibold">{rand(changeTotal(c as Parameters<typeof changeTotal>[0]))}</td>
                  <td>
                    <Invoicing b={billing.find((b) => b.changeId === c.id)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {!readOnly && (
        <>
          <details className="rounded-md border border-dashed border-field bg-white px-4 py-3 open:border-solid open:border-line">
            <summary className="cursor-pointer font-semibold text-teal-deep">Correct booking details</summary>
            <form action={fix} className="mt-3">
              <BookingFields booking={booking} suppliers={suppliers} flight={flight} />
              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" disabled={fixing}>Save the Correction</button>
                <Message state={fixState} />
              </div>
            </form>
          </details>
          {!issued && !cancelled && (
            <form action={issue} className="flex flex-wrap items-center gap-2">
              {flight && <input className="w-72" type="text" name="ticket_numbers" aria-label="Ticket numbers" placeholder="Ticket numbers, comma separated" defaultValue={(booking.ticket_numbers as string[]).join(", ")} />}
              <button type="submit" disabled={issuing}>Mark issued</button>
              <Message state={issueState} />
            </form>
          )}
          {!cancelled && <ChangeForm quoteId={quoteId} entityId={entityId} kind="change" item={item} issued={issued} />}
          {!cancelled && <ChangeForm quoteId={quoteId} entityId={entityId} kind="cancellation" item={item} issued={issued} />}
          {changes.length === 0 && (
            <form action={unbook} className="flex flex-wrap items-center gap-2">
              <ConfirmButton confirmLabel="Sure? Only if it was booked by mistake">
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
