"use client";

import { useActionState, useId } from "react";
import { AutosaveStatus, FieldError, useAutosave } from "@/app/autosave";
import { ConfirmButton } from "@/app/confirm-button";
import { isExpired, orderIdentities, type IdentityValues } from "@/lib/identity";
import { FileLink } from "@/app/file-viewer";
import { isImage } from "@/lib/files";
import {
  addIdentity,
  addTraveller,
  deleteIdentity,
  deleteTraveller,
  saveIdentity,
  saveTraveller,
  setIdentityImage,
  type TravellerFormState,
} from "./traveller-actions";
import { Badge, Msg } from "@/app/ui";

export type TravellerValues = {
  id: string;
  title: string | null;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  email: string | null;
  phone: string | null;
};

function Message({ state }: { state: TravellerFormState }) {
  if (state.error) return <Msg tone="error">{state.error}</Msg>;
  if (state.notice) return <Msg>{state.notice}</Msg>;
  return null;
}

/**
 * One Traveller: their details save as you leave each field. `identities` is null for
 * Users who may not see IDs and Passports (only the Consultant and admins may).
 */
export function TravellerCard({
  clientId,
  traveller,
  identified,
  identities,
  today,
  admin,
}: {
  clientId: string;
  traveller: TravellerValues;
  identified: boolean;
  identities: IdentityValues[] | null;
  today: string;
  admin: boolean;
}) {
  const name = `${traveller.first_name} ${traveller.last_name}`;
  const autosave = useAutosave({ key: traveller.id, label: `Traveller: ${name}`, save: (fd) => saveTraveller(traveller.id, fd) });

  return (
    <section className="mb-3.5 rounded-md border border-line bg-white p-5">
      <form ref={autosave.formRef}>
        <button type="submit" disabled hidden aria-hidden="true" />
        <div className="mb-2 flex flex-wrap items-center gap-2.5">
          <b>{name}</b>
          {!identified && <Badge tone="danger">No ID or Passport</Badge>}
        </div>
        <div className="flex flex-wrap items-end gap-x-3">
          <Field label="Title" name="title" value={traveller.title} width={70} />
          <Field label="First name" name="first_name" value={traveller.first_name} autosave={autosave} />
          <Field label="Last name" name="last_name" value={traveller.last_name} autosave={autosave} />
          <Field label="Date of birth" name="date_of_birth" type="date" value={traveller.date_of_birth} autosave={autosave} />
          <Field label="Email" name="email" type="email" value={traveller.email} />
          <Field label="Phone" name="phone" value={traveller.phone} />
        </div>
        <AutosaveStatus autosave={autosave} />
      </form>

      {identities === null ? (
        <p className="mb-4 text-muted">Only the Consultant and Administrators see this Traveller&apos;s ID and Passports.</p>
      ) : (
        <>
          {orderIdentities(identities).map((d) => (
            <IdentityRow key={d.id} clientId={clientId} doc={d} today={today} admin={admin} />
          ))}
          <AddIdentityForm clientId={clientId} travellerId={traveller.id} hasId={identities.some((d) => d.kind === "id")} />
        </>
      )}

      {admin && (
        <form action={deleteTraveller.bind(null, traveller.id)} className="mt-3">
          <ConfirmButton confirmLabel="Sure? Deletes their ID and Passports too">
            Delete Traveller
          </ConfirmButton>
        </form>
      )}
    </section>
  );
}

function Field({
  label,
  name,
  value,
  type = "text",
  width,
  autosave,
}: {
  label: string;
  name: string;
  value: string | null;
  type?: string;
  width?: number;
  autosave?: ReturnType<typeof useAutosave>;
}) {
  const id = useId();
  return (
    <div className="mb-3" style={width ? { width } : undefined}>
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} type={type} defaultValue={value ?? ""} />
      {autosave && <FieldError autosave={autosave} name={name} />}
    </div>
  );
}

function IdentityRow({ clientId, doc, today, admin }: { clientId: string; doc: IdentityValues; today: string; admin: boolean }) {
  const expired = isExpired(doc, today);
  const label = doc.kind === "id" ? "ID" : `Passport${doc.nationality ? ` (${doc.nationality})` : ""}`;
  const autosave = useAutosave({ key: doc.id, label, save: (fd) => saveIdentity(doc.id, fd) });
  const [state, upload, pending] = useActionState(setIdentityImage.bind(null, clientId, doc.id), {});

  return (
    <div className={`mt-2.5 border-l-4 bg-paper px-3 py-2.5 ${expired ? "border-line opacity-55" : "border-teal-deep"}`}>
      <form ref={autosave.formRef}>
        <button type="submit" disabled hidden aria-hidden="true" />
        <div className="mb-2 flex flex-wrap items-center gap-2.5">
          <b>{label}</b>
          {expired && <Badge>Expired</Badge>}
        </div>
        <div className="flex flex-wrap items-end gap-x-3">
          <Field label="Number" name="number" value={doc.number} autosave={autosave} />
          {doc.kind === "passport" && (
            <>
              <Field label="Nationality" name="nationality" value={doc.nationality} autosave={autosave} />
              <Field label="Issued" name="issued_on" type="date" value={doc.issued_on} autosave={autosave} />
              <Field label="Expires" name="expires_on" type="date" value={doc.expires_on} autosave={autosave} />
              <Field label="Name as printed" name="name_as_printed" value={doc.name_as_printed} />
            </>
          )}
        </div>
        <AutosaveStatus autosave={autosave} />
      </form>
      <div className="flex flex-wrap items-center gap-3">
        {doc.image_path ? (
          <FileLink href={`/clients/${clientId}/identity/${doc.id}`} title={label} image={isImage(doc.image_path)}>
            View image
          </FileLink>
        ) : (
          <form action={upload} className="flex flex-wrap items-center gap-2">
            <span className="text-muted">No image yet</span>
            <input type="file" name="image" accept="application/pdf,image/jpeg,image/png" required aria-label={`${label} image`} />
            <button type="submit" disabled={pending}>
              {pending ? "Uploading…" : "Add image"}
            </button>
            <Message state={state} />
          </form>
        )}
        {admin && (
          <form action={deleteIdentity.bind(null, doc.id)}>
            <ConfirmButton>Delete</ConfirmButton>
          </form>
        )}
      </div>
    </div>
  );
}

function AddIdentityForm({ clientId, travellerId, hasId }: { clientId: string; travellerId: string; hasId: boolean }) {
  const [state, action, pending] = useActionState(addIdentity.bind(null, clientId, travellerId), {});
  return (
    <details className="mt-3 rounded-md border border-dashed border-field bg-white px-4 py-3 open:border-solid open:border-line">
      <summary className="cursor-pointer font-semibold text-teal-deep">{hasId ? "Add a Passport" : "Add an ID or Passport"}</summary>
      <form action={action} className="mt-3 flex flex-wrap items-end gap-x-3">
        {hasId ? (
          <input type="hidden" name="kind" value="passport" />
        ) : (
          <div className="mb-3">
            <label>Kind</label>
            <select name="kind" defaultValue="passport">
              <option value="passport">Passport</option>
              <option value="id">ID</option>
            </select>
          </div>
        )}
        <Field label="Number" name="number" value={null} />
        <Field label="Nationality (Passport)" name="nationality" value={null} />
        <Field label="Issued (Passport)" name="issued_on" type="date" value={null} />
        <Field label="Expires (Passport)" name="expires_on" type="date" value={null} />
        <Field label="Name as printed, if different" name="name_as_printed" value={null} />
        <div className="mb-3">
          <label>Image (optional)</label>
          <input type="file" name="image" accept="application/pdf,image/jpeg,image/png" />
        </div>
        <button type="submit" disabled={pending} className="mb-3">
          {pending ? "Saving…" : "Add"}
        </button>
        <Message state={state} />
      </form>
    </details>
  );
}

/** A new Traveller for the Client; on a Trip page (`tripId`) they also go on that Trip. */
export function AddTravellerForm({ clientId, tripId }: { clientId: string; tripId?: string }) {
  const [state, action, pending] = useActionState(addTraveller.bind(null, clientId, tripId ?? null), {});
  return (
    <details className="mt-3 rounded-md border border-dashed border-field bg-white px-4 py-3 open:border-solid open:border-line">
      <summary className="cursor-pointer font-semibold text-teal-deep">New Traveller</summary>
      <form action={action} className="mt-3 flex flex-wrap items-end gap-x-3">
        <Field label="Title" name="title" value={null} width={70} />
        <Field label="First name" name="first_name" value={null} />
        <Field label="Last name" name="last_name" value={null} />
        <Field label="Date of birth" name="date_of_birth" type="date" value={null} />
        <Field label="Email" name="email" type="email" value={null} />
        <Field label="Phone" name="phone" value={null} />
        <button type="submit" disabled={pending} className="mb-3">
          {pending ? "Adding…" : "Add"}
        </button>
        <Message state={state} />
      </form>
    </details>
  );
}
