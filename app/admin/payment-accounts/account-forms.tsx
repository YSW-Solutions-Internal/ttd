"use client";

import { useActionState } from "react";
import { useKeptForm } from "@/app/kept-form";
import { ACCOUNT_KIND_LABEL } from "@/lib/payments";
import { Msg } from "@/app/ui";
import { Select } from "@/app/select";
import { addPaymentAccount } from "./actions";

export function AddAccountForm({ clientId, kinds }: { clientId: string | null; kinds: string[] }) {
  const [state, action, pending] = useActionState(addPaymentAccount.bind(null, clientId), {});
  const kept = useKeptForm(action, state);
  return (
    <form {...kept} className="mt-3 flex flex-wrap items-center gap-2">
      <Select name="kind" aria-label="Kind" className="inline-block" required options={kinds.map((k) => [k, ACCOUNT_KIND_LABEL[k]])} />
      <input className="w-72" name="nickname" aria-label="Nickname" placeholder="Nickname, e.g. Company card" required />
      <button type="submit" disabled={pending}>Add</button>
      {state.error && <Msg tone="error">{state.error}</Msg>}
    </form>
  );
}
