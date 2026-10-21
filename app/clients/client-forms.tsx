"use client";

import { useActionState } from "react";
import { saveClient, uploadDocument, type ClientFormState } from "./actions";

export type ClientValues = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  active: boolean;
  consultant_id: string;
};
export type ConsultantOption = { id: string; label: string };

function Message({ state }: { state: ClientFormState }) {
  if (state.error) return <div className="msg error">{state.error}</div>;
  if (state.notice) return <div className="msg">{state.notice}</div>;
  return null;
}

/**
 * New client (no `client`) or edit. `consultants` is passed only to admins;
 * everyone else gets no picker.
 */
export function ClientForm({
  client,
  consultants,
  defaultConsultantId,
  next,
}: {
  client?: ClientValues;
  consultants?: ConsultantOption[];
  defaultConsultantId?: string;
  next?: string;
}) {
  const [state, action, pending] = useActionState<ClientFormState, FormData>(saveClient, {});

  return (
    <form action={action} className="card">
      {client && <input type="hidden" name="id" value={client.id} />}
      {next && <input type="hidden" name="next" value={next} />}

      <div className="field">
        <label htmlFor="first_name">First name</label>
        <input id="first_name" name="first_name" type="text" required defaultValue={client?.first_name} />
      </div>
      <div className="field">
        <label htmlFor="last_name">Last name</label>
        <input id="last_name" name="last_name" type="text" required defaultValue={client?.last_name} />
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" defaultValue={client?.email ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="phone">Phone</label>
        <input id="phone" name="phone" type="text" defaultValue={client?.phone ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" rows={3} defaultValue={client?.notes ?? ""} />
      </div>

      {consultants && (
        <div className="field">
          <label htmlFor="consultant_id">Consultant</label>
          <select
            id="consultant_id"
            name="consultant_id"
            defaultValue={client?.consultant_id ?? defaultConsultantId}
          >
            {consultants.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {client && (
        <div className="field">
          <label>
            <input type="checkbox" name="active" defaultChecked={client.active} /> Active
          </label>
        </div>
      )}

      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : client ? "Save" : "Add client"}
      </button>
      <Message state={state} />
    </form>
  );
}

export function DocumentUploadForm({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState<ClientFormState, FormData>(
    uploadDocument.bind(null, clientId),
    {},
  );

  return (
    <form action={action} className="card">
      <label htmlFor="file">Add a document (PDF, JPG or PNG, up to 10 MB)</label>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <select name="kind" defaultValue="" required style={{ width: "auto" }} aria-label="Kind of document">
          <option value="" disabled>
            Kind…
          </option>
          <option value="id_copy">ID copy</option>
          <option value="passport_copy">Passport copy</option>
          <option value="other">Other</option>
        </select>
        <input id="file" name="file" type="file" accept="application/pdf,image/jpeg,image/png" required />
        <button type="submit" disabled={pending}>
          {pending ? "Uploading…" : "Upload"}
        </button>
      </div>
      <Message state={state} />
    </form>
  );
}
