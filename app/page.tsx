import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/relations";
import { NewQuoteForm } from "./new-quote-form";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: quotes, error } = await supabase
    .from("quotes")
    .select("id, reference, created_at, quote_versions(version_no), trips(reference, title, clients(client_no, full_name))")
    .order("created_at", { ascending: false });
  const { data: clients } = await supabase
    .from("clients")
    .select("id, client_no, full_name")
    .eq("active", true)
    .order("full_name");

  return (
    <main className="container">
      <h1>Quotes</h1>
      <p className="sub">Create a quote, add supplier screenshots, then review what the AI extracts.</p>

      <NewQuoteForm clients={clients ?? []} />

      <h2>All quotes</h2>
      {error && <div className="msg error">Could not load quotes: {error.message}</div>}
      {quotes && quotes.length === 0 && <p className="empty">No quotes yet.</p>}
      {quotes && quotes.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Trip</th>
              <th>Client</th>
              <th>Versions</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => {
              const trip = one(q.trips);
              const client = one(trip?.clients);
              return (
                <tr key={q.id}>
                  <td>
                    <Link href={`/quotes/${q.id}`}>
                      <b>{q.reference}</b>
                    </Link>
                  </td>
                  <td>
                    {trip?.title ?? "—"}
                    <div className="sub" style={{ margin: 0, fontSize: 12 }}>{trip?.reference}</div>
                  </td>
                  <td>
                    {client?.full_name ?? "—"}
                    <div className="sub" style={{ margin: 0, fontSize: 12 }}>{client?.client_no}</div>
                  </td>
                  <td>{q.quote_versions?.length ?? 0}</td>
                  <td>{new Date(q.created_at).toLocaleDateString("en-ZA")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
