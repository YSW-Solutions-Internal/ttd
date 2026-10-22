import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/relations";
import { TRIP_STATUSES, tripStatusLabel } from "@/lib/trip-status";
import { createQuote, setTripStatus } from "../actions";

const date = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-ZA") : null);

// Shared by the full Trip page and the Trip modal.
export async function TripView({ id }: { id: string }) {
  const supabase = await createClient();

  const { data: trip } = await supabase
    .from("trips")
    .select("id, reference, title, status, starts_on, ends_on, clients(id, client_code, full_name)")
    .eq("id", id)
    .maybeSingle();
  if (!trip) notFound();
  const client = one(trip.clients);

  const { data: quotes } = await supabase
    .from("quotes")
    .select("id, reference, created_at, quote_versions(version_no)")
    .eq("trip_id", id)
    .order("created_at", { ascending: false });

  return (
    <>
      <h1>
        {trip.reference}
        {trip.title ? ` · ${trip.title}` : ""}
      </h1>
      <p className="sub">
        For <Link href={`/clients/${client?.id}`}>{client?.full_name} ({client?.client_code})</Link> ·{" "}
        {trip.starts_on ? `${date(trip.starts_on)} – ${date(trip.ends_on) ?? "?"}` : "No dates yet"}
      </p>

      <form action={setTripStatus.bind(null, trip.id)} className="inline-form">
        <label htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={trip.status}>
          {TRIP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {tripStatusLabel(s)}
            </option>
          ))}
        </select>
        <button type="submit">Change</button>
      </form>

      <h2>Quotes</h2>
      <form action={createQuote.bind(null, trip.id)} style={{ marginBottom: 14 }}>
        <button type="submit">New quote</button>
      </form>
      {(!quotes || quotes.length === 0) && <p className="empty">No quotes yet.</p>}
      {quotes && quotes.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Reference</th>
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
                <td>{q.quote_versions?.length ?? 0}</td>
                <td>{new Date(q.created_at).toLocaleDateString("en-ZA")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
