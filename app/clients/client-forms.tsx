"use client";

import { useActionState, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { AutosaveStatus, FieldError, useAutosave, useSaves } from "@/app/autosave";
import { FileDrop } from "@/app/file-drop";
import { addClient, updateClient, uploadDocument, type ClientFormState } from "./actions";

export type ClientValues = {
  id: string;
  kind: "person" | "company";
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  contact_name: string | null;
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
  return client ? (
    <EditClientForm client={client} consultants={consultants} />
  ) : (
    <NewClientForm consultants={consultants} defaultConsultantId={defaultConsultantId} next={next} />
  );
}

/** Each field saves as you leave it. */
function EditClientForm({ client, consultants }: { client: ClientValues; consultants?: ConsultantOption[] }) {
  const autosave = useAutosave({ key: client.id, label: "Client details", save: (fd) => updateClient(client.id, fd) });

  return (
    <form ref={autosave.formRef} className="card">
      {/* Enter in a text box would submit the form; a disabled first submit button makes it do nothing. */}
      <button type="submit" disabled hidden aria-hidden="true" />
      <ClientFields client={client} consultants={consultants} error={(name) => <FieldError autosave={autosave} name={name} />} />
      <AutosaveStatus autosave={autosave} />
    </form>
  );
}

/**
 * The Client is added once both names are filled in and the user clicks or tabs to
 * something on the page outside this form: its code comes from the names and never
 * changes, so it waits. Switching windows or following a link never adds it; leaving
 * then warns instead.
 */
function NewClientForm({
  consultants,
  defaultConsultantId,
  next,
}: {
  consultants?: ConsultantOption[];
  defaultConsultantId?: string;
  next?: string;
}) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const added = useRef(false);
  const { block } = useSaves();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const named = () => {
      const fd = new FormData(form);
      const keys = fd.get("kind") === "company" ? ["company_name"] : ["first_name", "last_name"];
      return keys.every((k) => String(fd.get(k) ?? "").trim() !== "");
    };
    const update = () => block("new-client", named() && !added.current ? "New client (not yet added)" : null);
    const leave = (e: Event) => {
      const target = e.target as Element;
      if (added.current || !named() || form.contains(target) || target.closest?.("a[href]")) return;
      added.current = true;
      block("new-client", null);
      startTransition(async () => {
        // On success addClient redirects, so only an error comes back.
        const r = await addClient(new FormData(form));
        if (r.error) {
          added.current = false;
          setError(r.error);
          update();
        }
      });
    };
    form.addEventListener("input", update);
    document.addEventListener("pointerdown", leave);
    document.addEventListener("focusin", leave);
    return () => {
      form.removeEventListener("input", update);
      document.removeEventListener("pointerdown", leave);
      document.removeEventListener("focusin", leave);
      block("new-client", null);
    };
  }, [block]);

  return (
    <form ref={formRef} className="card">
      <button type="submit" disabled hidden aria-hidden="true" />
      {next && <input type="hidden" name="next" value={next} />}
      <ClientFields consultants={consultants} defaultConsultantId={defaultConsultantId} />
      {pending ? (
        <div className="msg">Adding…</div>
      ) : error ? (
        <div className="msg error">{error}</div>
      ) : (
        <div className="sub">The client is added when you move on from this form.</div>
      )}
    </form>
  );
}

function ClientFields({
  client,
  consultants,
  defaultConsultantId,
  error = () => null,
}: {
  client?: ClientValues;
  consultants?: ConsultantOption[];
  defaultConsultantId?: string;
  error?: (name: string) => ReactNode;
}) {
  // Chosen once, when the Client is added: the code is made from the name.
  const [kind, setKind] = useState(client?.kind ?? "person");
  return (
    <>
      {!client && (
        <div className="field">
          <label>
            <input type="radio" name="kind" value="person" checked={kind === "person"} onChange={() => setKind("person")} /> Person
          </label>{" "}
          <label>
            <input type="radio" name="kind" value="company" checked={kind === "company"} onChange={() => setKind("company")} /> Company
          </label>
        </div>
      )}
      {kind === "person" ? (
        <>
          <div className="field">
            <label htmlFor="first_name">First name</label>
            <input id="first_name" name="first_name" type="text" required defaultValue={client?.first_name ?? ""} />
            {error("first_name")}
          </div>
          <div className="field">
            <label htmlFor="last_name">Last name</label>
            <input id="last_name" name="last_name" type="text" required defaultValue={client?.last_name ?? ""} />
            {error("last_name")}
          </div>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="company_name">Company name</label>
            <input id="company_name" name="company_name" type="text" required defaultValue={client?.company_name ?? ""} />
            {error("company_name")}
          </div>
          <div className="field">
            <label htmlFor="contact_name">Contact person</label>
            <input id="contact_name" name="contact_name" type="text" defaultValue={client?.contact_name ?? ""} />
          </div>
        </>
      )}
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

    </>
  );
}

export function DocumentUploadForm({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState<ClientFormState, FormData>(
    uploadDocument.bind(null, clientId),
    {},
  );

  return (
    <form action={action} className="card">
      <label htmlFor="file">Add a document (PDF, JPG or PNG, up to 10 MB). ID and passport images go with the Traveller.</label>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <FileDrop id="file" name="file" accept="application/pdf,image/jpeg,image/png" required />
        <button type="submit" disabled={pending}>
          {pending ? "Uploading…" : "Upload"}
        </button>
      </div>
      <Message state={state} />
    </form>
  );
}
