"use client";

import { useActionState, useId, useState } from "react";
import { useKeptForm } from "@/app/kept-form";
import { REFUND_STATUS_LABEL, type RefundStatus } from "@/lib/refunds";
import { Field, Message, Select } from "./payment-forms";
import { setCommission, setRefund } from "./refund-actions";

export function RefundForm({ changeId, status, requestedOn, reference, approved }: { changeId: string; status: RefundStatus; requestedOn: string; reference: string; approved: string }) {
  const [state, action, pending] = useActionState(setRefund.bind(null, changeId), {});
  const kept = useKeptForm(action, state);
  return (
    <form {...kept} className="mt-3">
      <div className="flex flex-wrap items-end gap-x-3">
        <Select label="Supplier's answer" name="status" options={Object.entries(REFUND_STATUS_LABEL).map(([id, label]) => ({ id, label }))} defaultValue={status} required />
        <Field label="Requested on" name="requested_on" type="date" defaultValue={requestedOn} />
        <Field label="Supplier reference" name="reference" defaultValue={reference} />
        <Field label="Approved (R)" name="approved" type="number" defaultValue={approved} />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending}>Save Refund</button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function CommissionForm({
  quoteId,
  entityId,
  currency,
  current,
}: {
  quoteId: string;
  entityId: string;
  currency: string;
  current: { amount: string; note: string; deducted: boolean; claimedOn: string; reference: string; dueOn: string } | null;
}) {
  const [state, action, pending] = useActionState(setCommission.bind(null, quoteId, entityId), {});
  const kept = useKeptForm(action, state);
  const [deducted, setDeducted] = useState(current?.deducted ?? false);
  const box = useId();
  return (
    <details className="mt-2">
      <summary className="cursor-pointer font-semibold text-teal-deep">{current ? "Edit Commission" : "Add Commission"}</summary>
      <form {...kept} onReset={() => setDeducted(current?.deducted ?? false)} className="mt-3">
        <div className="flex flex-wrap items-end gap-x-3">
          <Field label={`Commission (${currency}; blank takes it off)`} name="amount" type="number" defaultValue={current?.amount} />
          <Field label="How it was worked out" name="note" defaultValue={current?.note} />
        </div>
        <p className="mb-3 flex items-center gap-2">
          <input id={box} type="checkbox" name="deducted" checked={deducted} onChange={(e) => setDeducted(e.target.checked)} />
          <label htmlFor={box} className="m-0">Deducted from the Supplier payment</label>
        </p>
        {!deducted && (
          <div className="flex flex-wrap items-end gap-x-3">
            <Field label="Claimed on" name="claimed_on" type="date" defaultValue={current?.claimedOn} />
            <Field label="Claim reference" name="reference" defaultValue={current?.reference} />
            <Field label="Due on" name="due_on" type="date" defaultValue={current?.dueOn} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={pending}>Save Commission</button>
          <Message state={state} />
        </div>
      </form>
    </details>
  );
}
