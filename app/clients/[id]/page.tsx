import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { one } from "@/lib/relations";
import { ClientForm, DocumentUploadForm, type ClientValues } from "../client-forms";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  id_copy: "ID copy",
  passport_copy: "Passport copy",
  other: "Other",
};

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getProfile();
  if (!me) redirect("/login");
  const supabase = await createClient();

  // RLS (0007) returns nothing unless you are the Consultant or an admin.
  const { data: client } = await supabase
    .from("clients")
    .select(
      "id, client_code, first_name, last_name, full_name, email, phone, notes, active, consultant_id, profiles!clients_consultant_id_fkey(full_name, email)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!client) notFound();
  const consultant = one(client.profiles);

  const [{ data: documents }, { data: trips }, { data: profiles }] = await Promise.all([
    supabase
      .from("client_documents")
      .select("id, kind, filename, created_at, profiles(full_name, email)")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("trips")
      .select("id, reference, title, status, created_at")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    me.role === "admin"
      ? supabase.from("profiles").select("id, full_name, email").order("full_name")
      : Promise.resolve({ data: null }),
  ]);
  const consultants = profiles?.map((p) => ({ id: p.id, label: p.full_name ?? p.email }));

  return (
    <main className="container">
      <p className="sub">
        <Link href="/clients">← All clients</Link>
      </p>
      <h1>
        {client.client_code} · {client.full_name}
      </h1>
      <p className="sub">
        Consultant: {consultant?.full_name ?? consultant?.email ?? "—"}
        {me.role !== "admin" && " (an administrator can hand this client over)"}
      </p>

      <h2>Details</h2>
      <ClientForm client={client as ClientValues} consultants={consultants} />

      <h2>Documents</h2>
      <DocumentUploadForm clientId={client.id} />
      {(!documents || documents.length === 0) && <p className="empty">No documents yet.</p>}
      {documents && documents.length > 0 && (
        <table style={{ marginTop: 14 }}>
          <thead>
            <tr>
              <th>Kind</th>
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
                  <td>{KIND_LABELS[d.kind] ?? d.kind}</td>
                  <td>{d.filename}</td>
                  <td>{by?.full_name ?? by?.email ?? "—"}</td>
                  <td>{new Date(d.created_at).toLocaleDateString("en-ZA")}</td>
                  <td>
                    <a href={`/clients/${client.id}/documents/${d.id}`} target="_blank" rel="noopener">
                      View
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <h2>Trips</h2>
      <p className="sub">
        <Link href={`/trips/new?client=${client.id}`}>+ New trip for this client</Link>
      </p>
      {(!trips || trips.length === 0) && <p className="empty">No trips yet.</p>}
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
                <td>{t.status.replace("_", " ")}</td>
                <td>{new Date(t.created_at).toLocaleDateString("en-ZA")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
