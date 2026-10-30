"use client";

import { useActionState } from "react";
import { ConfirmButton } from "@/app/confirm-button";
import { mergeSupplier, renameSupplier, type SupplierFormState } from "./actions";
import { Msg } from "@/app/ui";

function Message({ state }: { state: SupplierFormState }) {
  if (state.error) return <Msg tone="error">{state.error}</Msg>;
  if (state.notice) return <Msg>{state.notice}</Msg>;
  return null;
}

export function RenameForm({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState(renameSupplier, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input name="name" aria-label="Supplier name" defaultValue={name} required />
      <button type="submit" disabled={pending}>Rename</button>
      <Message state={state} />
    </form>
  );
}

export function MergeForm({ id, others }: { id: string; others: { id: string; name: string }[] }) {
  const [state, action] = useActionState(mergeSupplier, {});
  if (others.length === 0) return null;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <select name="into" aria-label="Merge into" defaultValue="">
        <option value="">Merge into…</option>
        {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <ConfirmButton confirmLabel="Sure? This one is removed">
        Merge
      </ConfirmButton>
      <Message state={state} />
    </form>
  );
}
