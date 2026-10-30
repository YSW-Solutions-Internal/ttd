"use client";

import { useActionState, useId } from "react";
import { ConfirmButton } from "@/app/confirm-button";
import type { Side } from "@/lib/invoicing";
import { Button, Msg } from "@/app/ui";
import { addInvoice, addLink, deleteInvoice, removeLink, setInvoiceStatus, type InvoiceFormState } from "./invoice-actions";

function Message({ state }: { state: InvoiceFormState }) {
  if (state.error) return <Msg tone="error">{state.error}</Msg>;
  if (state.notice) return <Msg>{state.notice}</Msg>;
  return null;
}

function Field({ label, name, type = "text", required, defaultValue }: { label: string; name: string; type?: string; required?: boolean; defaultValue?: string }) {
  const id = useId();
  return (
    <div className="mb-3 min-w-[150px] flex-1">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} type={type} step={type === "number" ? "0.01" : undefined} required={required} defaultValue={defaultValue} />
    </div>
  );
}

export function AddInvoiceForm({ tripId, side, suppliers }: { tripId: string; side: Side; suppliers: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(addInvoice.bind(null, tripId, side), {});
  const id = useId();
  const supplier = side === "supplier";
  if (supplier && suppliers.length === 0) return <p className="mt-2 text-muted">Book an Item with its Supplier first; Supplier invoices are linked to booked Items.</p>;
  return (
    <details className="mt-3 rounded-md border border-dashed border-field bg-white px-4 py-3 open:border-solid open:border-line">
      <summary className="cursor-pointer font-semibold text-teal-deep">
        {supplier ? "Add a Supplier invoice or credit note" : "Add a Client invoice or credit note (Quicktrav PDF)"}
      </summary>
      <form action={action} className="mt-3">
        <div className="flex flex-wrap items-end gap-x-3">
          {supplier && (
            <div className="mb-3 min-w-[200px] flex-1">
              <label htmlFor={`${id}-s`}>Supplier</label>
              <select id={`${id}-s`} name="supplier_id" required>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Field label={supplier ? "Invoice number" : "Quicktrav number"} name="number" required />
          <Field label="Date" name="issued_on" type="date" required />
          {supplier && <Field label="Currency" name="currency" defaultValue="ZAR" required />}
          <Field label={supplier ? "Amount" : "Amount (R)"} name="amount" type="number" required />
          <div className="mb-3 min-w-[200px] flex-1">
            <label htmlFor={`${id}-f`}>PDF</label>
            <input id={`${id}-f`} name="file" type="file" accept="application/pdf" required />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="mb-0 flex items-center gap-2 font-normal">
            <input type="checkbox" name="credit_note" /> Credit note
          </label>
          <button type="submit" disabled={pending}>Add</button>
          <Message state={state} />
        </div>
      </form>
    </details>
  );
}

export function LinkForm({
  tripId,
  invoiceId,
  quoteId,
  credit,
  targets,
  remaining,
}: {
  tripId: string;
  invoiceId: string;
  quoteId: string;
  credit: boolean;
  targets: { key: string; label: string }[];
  remaining: number;
}) {
  const [state, action, pending] = useActionState(addLink.bind(null, tripId, invoiceId, quoteId, credit), {});
  if (targets.length === 0) return null;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <select className="w-auto max-w-full" name="target" aria-label="Item or Change this invoice is for" required>
        {targets.map((t) => (
          <option key={t.key} value={t.key}>
            {t.label}
          </option>
        ))}
      </select>
      <input className="w-32" name="amount" type="number" step="0.01" aria-label="Amount for it" defaultValue={Math.abs(remaining) || undefined} required />
      <button type="submit" disabled={pending}>Link</button>
      <Message state={state} />
    </form>
  );
}

export function RemoveLinkButton({ tripId, linkId }: { tripId: string; linkId: string }) {
  const [state, action] = useActionState(removeLink.bind(null, tripId, linkId), {});
  return (
    <form action={action} className="flex items-center gap-2">
      <Button type="submit" variant="quiet">Unlink</Button>
      <Message state={state} />
    </form>
  );
}

export function DeleteInvoiceButton({ tripId, invoiceId }: { tripId: string; invoiceId: string }) {
  const [state, action] = useActionState(deleteInvoice.bind(null, tripId, invoiceId), {});
  return (
    <form action={action} className="flex items-center gap-2">
      <ConfirmButton confirmLabel="Sure? Delete this invoice">
        Delete
      </ConfirmButton>
      <Message state={state} />
    </form>
  );
}

/** Verify, Query with a reason, or back to Received: Accountants and Administrators only. */
export function StatusForms({ tripId, invoiceId, status }: { tripId: string; invoiceId: string; status: string }) {
  const [verifyState, verify, verifying] = useActionState(setInvoiceStatus.bind(null, tripId, invoiceId, "verified"), {});
  const [queryState, query, querying] = useActionState(setInvoiceStatus.bind(null, tripId, invoiceId, "query"), {});
  const [backState, back] = useActionState(setInvoiceStatus.bind(null, tripId, invoiceId, "received"), {});
  return (
    <>
      {status !== "verified" && (
        <form action={verify} className="flex items-center gap-2">
          <button type="submit" disabled={verifying}>Verify</button>
          <Message state={verifyState} />
        </form>
      )}
      {status !== "query" && (
        <form action={query} className="flex items-center gap-2">
          <input className="w-64" type="text" name="query_reason" aria-label="What is wrong with it" placeholder="What is wrong with it" required />
          <button type="submit" disabled={querying}>Query</button>
          <Message state={queryState} />
        </form>
      )}
      {status !== "received" && (
        <form action={back} className="flex items-center gap-2">
          <Button type="submit" variant="quiet">Back to Received</Button>
          <Message state={backState} />
        </form>
      )}
    </>
  );
}
