"use client";

import { useActionState } from "react";
import { useKeptForm } from "@/app/kept-form";
import { ACCOUNT_KIND_LABEL } from "@/lib/payments";
import { Msg } from "@/app/ui";
import { addPaymentAccount } from "./actions";

export function AddAccountForm({ clientId, kinds }: { clientId: string | null; kinds: string[] }) {
  const [state, action, pending] = useActionState(addPaymentAccount.bind(null, clientId), {});
  const kept = useKeptForm(action, state);
  return (
    <form {...kept} className="mt-3 flex flex-wrap items-center gap-2">
      <select name="kind" aria-label="Kind" className="w-auto" required>
        {kinds.map((k) => (
          <option key={k} value={k}>
            {ACCOUNT_KIND_LABEL[k]}
          </option>
        ))}
      </select>
      <input className="w-72" name="nickname" aria-label="Nickname" placeholder="Nickname, e.g. Company card" required />
      <button type="submit" disabled={pending}>Add</button>
      {state.error && <Msg tone="error">{state.error}</Msg>}
    </form>
  );
}
