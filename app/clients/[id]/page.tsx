import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canEdit, getProfile } from "@/lib/auth";
import { History } from "@/app/history";
import { one } from "@/lib/relations";
import { ClientForm, DocumentUploadForm, type ClientValues } from "../client-forms";
import { AddTravellerForm, TravellerCard } from "../travellers";
import type { IdentityValues } from "@/lib/identity";
import { FileLink } from "@/app/file-viewer";
import { isImage } from "@/lib/files";
import { BUTTON, TripStatusBadge } from "@/app/ui";

export const dynamic = "force-dynamic";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getProfile();
  if (!me) redirect("/login");
  const supabase = await createClient();

  const { data: client } = await supabase
    .from("clients")
    .select(
      "id, kind, client_code, first_name, last_name, company_name, contact_name, full_name, email, phone, notes, active, consultant_id, profiles!clients_consultant_id_fkey(full_name, email)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!client) notFound();
  const consultant = one(client.profiles);

  const [{ data: documents }, { data: trips }, { data: profiles }, { data: travellers }, { data: flags }, { data: identities }] = await Promise.all([
    supabase
      .from("client_documents")
      .select("id, filename, created_at, profiles(full_name, email)")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("trips")
      .select("id, reference, title, status, created_at")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    me.role === "admin"
      ? supabase.from("profiles").select("id, full_name, email").in("role", ["user", "admin"]).order("full_name")
      : Promise.resolve({ data: null }),
    supabase
      .from("travellers")
      .select("id, title, first_name, last_name, date_of_birth, email, phone")
      .eq("client_id", id)
      .order("last_name")
      .order("first_name"),
    supabase.from("traveller_flags").select("traveller_id, identified").eq("client_id", id),
    // RLS returns these only to the Consultant and admins.
    supabase
      .from("identity_documents")
      .select("id, traveller_id, kind, number, nationality, issued_on, expires_on, name_as_printed, image_path, travellers!inner(client_id)")
      .eq("travellers.client_id", id),
  ]);
  // RLS keeps documents to the Consultant and Administrators (ADR 0010); this only hides the empty section.
  const seesDocuments = me.role === "admin" || client.consultant_id === me.id;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" }); // YYYY-MM-DD
  const consultants = profiles?.map((p) => ({ id: p.id, label: p.full_name ?? p.email }));

  return (
    <main className="mx-auto my-8 max-w-[1200px] px-5">
      <p className="mb-3">
        <Link href="/clients">All clients</Link>
      </p>
      <span className="font-semibold text-muted tabular-nums">{client.client_code}</span>
      <h1 className="mt-1">{client.full_name}</h1>
      <p className="mb-4 text-muted">
        Consultant: {consultant?.full_name ?? consultant?.email ?? "—"}
        {me.role !== "admin" && " (an administrator can hand this client over)"}
      </p>

      <h2>Details</h2>
      <fieldset className="min-w-0" disabled={!canEdit(me.role)}>
        <ClientForm client={client as ClientValues} consultants={consultants} />
      </fieldset>

      <h2>Travellers</h2>
      {(!travellers || travellers.length === 0) && <p className="py-3 text-muted">No Travellers yet.</p>}
      {(travellers ?? []).map((t) => (
        <fieldset key={t.id} className="min-w-0" disabled={!canEdit(me.role)}>
          <TravellerCard
            clientId={client.id}
            traveller={t}
            identified={flags?.find((f) => f.traveller_id === t.id)?.identified ?? false}
            identities={seesDocuments ? (identities ?? []).filter((d) => d.traveller_id === t.id) as IdentityValues[] : null}
            today={today}
            admin={me.role === "admin"}
          />
        </fieldset>
      ))}
      {canEdit(me.role) && <AddTravellerForm clientId={client.id} />}

      <h2>Documents</h2>
      {!seesDocuments && <p className="py-3 text-muted">Only the Consultant and Administrators see this Client&apos;s documents.</p>}
      {seesDocuments && <DocumentUploadForm clientId={client.id} />}
      {seesDocuments && (!documents || documents.length === 0) && <p className="py-3 text-muted">No documents yet.</p>}
      {documents && documents.length > 0 && (
        <table className="mt-3.5">
          <thead>
            <tr>
              <th>File</th>
              <th>Uploaded by</th>
              <th>Uploaded</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => {
              const by = one(d.profiles);
              return (
                <tr key={d.id}>
                  <td>{d.filename}</td>
                  <td>{by?.full_name ?? by?.email ?? "—"}</td>
                  <td>{new Date(d.created_at).toLocaleDateString("en-ZA")}</td>
                  <td>
                    <FileLink href={`/clients/${client.id}/documents/${d.id}`} title={d.filename} image={isImage(d.filename)}>
                      View
                    </FileLink>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="mt-8 mb-2.5 flex flex-wrap items-end justify-between gap-3">
        <h2 className="m-0">Trips</h2>
        {canEdit(me.role) && (
          <Link href={`/trips/new?client=${client.id}`} className={BUTTON.primary}>
            New trip for this client
          </Link>
        )}
      </div>
      {(!trips || trips.length === 0) && <p className="py-3 text-muted">No trips yet.</p>}
      {trips && trips.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Title</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {trips.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link href={`/trips/${t.id}`}>
                    <b>{t.reference}</b>
                  </Link>
                </td>
                <td>{t.title ?? "—"}</td>
                <td>
                  <TripStatusBadge status={t.status} />
                </td>
                <td>{new Date(t.created_at).toLocaleDateString("en-ZA")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <History clientId={client.id} />
    </main>
  );
}
