import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NewQuoteForm } from "./new-quote-form";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: quotes, error } = await supabase
    .from("quotes")
    .select("id, reference, title, client_name, created_at, quote_versions(version_no)")
    .order("created_at", { ascending: false });

  return (
    <main className="container">
      <h1>Quotes</h1>
      <p className="sub">Create a quote, add supplier screenshots, then review what the AI extracts.</p>

      <NewQuoteForm />

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
            {quotes.map((q) => (
              <tr key={q.id}>
                <td>
                  <Link href={`/quotes/${q.id}`}>
                    <b>{q.reference}</b>
                  </Link>
                </td>
                <td>{q.title}</td>
                <td>{q.client_name ?? "—"}</td>
                <td>{q.quote_versions?.length ?? 0}</td>
                <td>{new Date(q.created_at).toLocaleDateString("en-ZA")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
