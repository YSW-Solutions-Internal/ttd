"use client";

import { useActionState, useId, useState } from "react";
import { useKeptForm } from "@/app/kept-form";
import { ConfirmButton } from "@/app/confirm-button";
import type { Side } from "@/lib/invoicing";
import { KINDS, PAYMENT_KIND_LABEL, type PaymentKind, type PaymentStatus } from "@/lib/payments";
import type { KindTarget } from "./payments";
import { Button, Msg } from "@/app/ui";
import { addPayment, addPaymentLink, deletePayment, removePaymentLink, reversePayment, setPaymentStatus, type PaymentFormState } from "./payment-actions";
import { todayInSA as today } from "@/lib/dates";

export type Option = { id: string; label: string; lands?: boolean }; // lands: a Client's EFT or Cash, which lands in an agency account

export function Message({ state }: { state: PaymentFormState }) {
  if (state.error) return <Msg tone="error">{state.error}</Msg>;
  if (state.notice) return <Msg>{state.notice}</Msg>;
  return null;
}

export function Field({ label, name, type = "text", required, defaultValue }: { label: string; name: string; type?: string; required?: boolean; defaultValue?: string }) {
  const id = useId();
  return (
    <div className="mb-3 min-w-[150px] flex-1">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} type={type} step={type === "number" ? "0.01" : undefined} required={required} defaultValue={defaultValue} />
    </div>
  );
}

export function Select({ label, name, options, required, empty, defaultValue, onChange }: { label: string; name: string; options: Option[]; required?: boolean; empty?: string; defaultValue?: string; onChange?: (id: string) => void }) {
  const id = useId();
  return (
    <div className="mb-3 min-w-[200px] flex-1">
      <label htmlFor={id}>{label}</label>
      <select id={id} name={name} required={required} defaultValue={defaultValue} onChange={onChange && ((e) => onChange(e.target.value))}>
        {empty !== undefined && <option value="">{empty}</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}


export function AddPaymentForm({
  tripId,
  quoteId,
  side,
  targets,
  suppliers,
  accounts,
  landing,
}: {
  tripId: string;
  quoteId: string;
  side: Side;
  targets: KindTarget[];
  suppliers: Option[];
  accounts: Option[];
  landing: Option[];
}) {
  const [state, action, pending] = useActionState(addPayment.bind(null, tripId, quoteId, side), {});
  const [kind, setKind] = useState<PaymentKind>(KINDS[side][0]);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const fits = targets.filter((t) => t.kind === kind && (side === "client" || t.supplierId === supplierId));
  const kept = useKeptForm(action, state);
  const supplier = side === "supplier";
  const [chosen, setChosen] = useState(accounts[0]?.id ?? "");
  const lands = accounts.find((a) => a.id === chosen)?.lands ?? false;
  const [currency, setCurrency] = useState("ZAR");
  const uid = useId();
  if (supplier && suppliers.length === 0) return null;
  return (
    <details className="mt-3 rounded-md border border-dashed border-field bg-white px-4 py-3 open:border-solid open:border-line">
      <summary className="cursor-pointer font-semibold text-teal-deep">{supplier ? "Record a Payment to or from a Supplier" : "Record a Payment from or to the Client"}</summary>
      <form
        {...kept}
        onReset={() => {
          setChosen(accounts[0]?.id ?? "");
          setCurrency("ZAR");
          setKind(KINDS[side][0]);
          setSupplierId(suppliers[0]?.id ?? "");
        }}
        className="mt-3"
      >
        <div className="flex flex-wrap items-end gap-x-3">
          <Select label="What" name="kind" options={KINDS[side].map((k) => ({ id: k, label: PAYMENT_KIND_LABEL[k] }))} required onChange={(k) => setKind(k as PaymentKind)} />
          {supplier && <Select label="Supplier" name="supplier_id" options={suppliers} required onChange={setSupplierId} />}
          {/* Keyed so the choice resets with the kind and Supplier; one match is chosen for you. */}
          <Select
            key={`${kind}|${supplierId}`}
            label="For"
            name="target"
            options={fits}
            empty="Link later (or to several)"
            defaultValue={fits.length === 1 ? fits[0].id : ""}
          />
          <Field label="Date" name="paid_on" type="date" defaultValue={today()} required />
          {supplier && (
            <div className="mb-3 min-w-[90px] flex-none">
              <label htmlFor={`${uid}-cur`}>Currency</label>
              <input id={`${uid}-cur`} name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} size={4} required />
            </div>
          )}
          {/* Like booking: the rate is asked for only when the money is not in Rand. */}
          {supplier && currency.trim().toUpperCase() !== "ZAR" && (
            <div className="mb-3 min-w-[150px] flex-1">
              <label htmlFor={`${uid}-rate`}>Rate to Rand</label>
              <input id={`${uid}-rate`} name="rate" type="number" step="any" min="0" required />
            </div>
          )}
          <Field label={supplier ? "Amount" : "Amount (R)"} name="amount" type="number" required />
          <Select label={supplier ? "Paid with" : "Paid by"} name="account_id" options={accounts} required onChange={setChosen} />
          {lands && landing.length > 0 && <Select label="Into" name="landed_account_id" options={landing} required />}
          <Field label="Notes" name="notes" />
        </div>
        {lands && landing.length === 0 && (
          <Msg tone="warn" className="mb-3">
            EFT and Cash go into one of the agency&apos;s own accounts, and none is set up yet. An Administrator adds the bank account and cash box under Payment accounts.
          </Msg>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={pending || (lands && landing.length === 0)}>Record</button>
          <Message state={state} />
        </div>
      </form>
    </details>
  );
}

export function PaymentLinkForm({ paymentId, quoteId, side, targets, remaining }: { paymentId: string; quoteId: string; side: Side; targets: Option[]; remaining: number }) {
  const [state, action, pending] = useActionState(addPaymentLink.bind(null, paymentId, quoteId, side), {});
  const kept = useKeptForm(action, state);
  if (targets.length === 0) return null;
  return (
    <form {...kept} className="flex flex-wrap items-center gap-2">
      <select className="w-auto max-w-full" name="target" aria-label="What it is for" required>
        {targets.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      <input className="w-32" name="amount" type="number" step="0.01" aria-label="Amount for it" defaultValue={remaining || undefined} required />
      <button type="submit" disabled={pending}>Link</button>
      <Message state={state} />
    </form>
  );
}

export function RemovePaymentLinkButton({ linkId }: { linkId: string }) {
  const [state, action] = useActionState(removePaymentLink.bind(null, linkId), {});
  return (
    <form action={action} className="flex items-center gap-2">
      <Button type="submit" variant="quiet">Unlink</Button>
      <Message state={state} />
    </form>
  );
}

export function DeletePaymentButton({ paymentId }: { paymentId: string }) {
  const [state, action] = useActionState(deletePayment.bind(null, paymentId), {});
  return (
    <form action={action} className="flex items-center gap-2">
      <ConfirmButton confirmLabel="Sure? Delete this Payment">Delete</ConfirmButton>
      <Message state={state} />
    </form>
  );
}

export function ReverseForm({ paymentId }: { paymentId: string }) {
  const [state, action, pending] = useActionState(reversePayment.bind(null, paymentId), {});
  const kept = useKeptForm(action, state);
  return (
    <form {...kept} className="flex flex-wrap items-center gap-2">
      <input className="w-40" type="date" name="paid_on" aria-label="Date of the reversal" defaultValue={today()} required />
      <input className="w-56" type="text" name="notes" aria-label="Why" placeholder="Why (optional)" />
      <Button type="submit" variant="danger" disabled={pending}>Reverse</Button>
      <Message state={state} />
    </form>
  );
}

/** Reconcile, Query with a reason, or back to Unreconciled: Accountants and Administrators only. */
export function PaymentStatusForms({ paymentId, status }: { paymentId: string; status: PaymentStatus }) {
  const [okState, reconcile, reconciling] = useActionState(setPaymentStatus.bind(null, paymentId, "reconciled"), {});
  const [queryState, query, querying] = useActionState(setPaymentStatus.bind(null, paymentId, "query"), {});
  const [backState, back] = useActionState(setPaymentStatus.bind(null, paymentId, "unreconciled"), {});
  const keptQuery = useKeptForm(query, queryState);
  return (
    <>
      {status !== "reconciled" && (
        <form action={reconcile} className="flex items-center gap-2">
          <button type="submit" disabled={reconciling}>Reconciled</button>
          <Message state={okState} />
        </form>
      )}
      {status !== "query" && (
        <form {...keptQuery} className="flex items-center gap-2">
          <input className="w-56" type="text" name="query_reason" aria-label="What is wrong with it" placeholder="What is wrong with it" required />
          <button type="submit" disabled={querying}>Query</button>
          <Message state={queryState} />
        </form>
      )}
      {status !== "unreconciled" && (
        <form action={back} className="flex items-center gap-2">
          <Button type="submit" variant="quiet">Back to Unreconciled</Button>
          <Message state={backState} />
        </form>
      )}
    </>
  );
}
