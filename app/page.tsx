import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/relations";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  // RLS (0007): trips of your own clients, or all of them for an admin.
  const { data: trips, error } = await supabase
    .from("trips")
    .select("id, reference, title, status, created_at, quotes(id), clients(client_code, full_name)")
    .order("created_at", { ascending: false });

  return (
    <main className="container">
      <h1>Trips</h1>
      <p className="sub">
        <Link href="/trips/new">+ New trip</Link>
      </p>

      {error && <div className="msg error">Could not load trips: {error.message}</div>}
      {trips && trips.length === 0 && <p className="empty">No trips yet.</p>}
      {trips && trips.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Trip</th>
              <th>Client</th>
              <th>Quotes</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {trips.map((t) => {
              const client = one(t.clients);
              return (
                <tr key={t.id}>
                  <td>
                    <Link href={`/trips/${t.id}`}>
                      <b>{t.reference}</b>
                    </Link>
                  </td>
                  <td>
                    {t.title ?? "—"}
                    <div className="sub" style={{ margin: 0, fontSize: 12 }}>{t.status.replace("_", " ")}</div>
                  </td>
                  <td>
                    {client?.full_name ?? "—"}
                    <div className="sub" style={{ margin: 0, fontSize: 12 }}>{client?.client_code}</div>
                  </td>
                  <td>{t.quotes?.length ?? 0}</td>
                  <td>{new Date(t.created_at).toLocaleDateString("en-ZA")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
