import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/relations";
import { StayRow } from "./stays-form";
import { TripForm } from "./trip-form";

const date = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-ZA") : null);

// Shared by the full Trip page and the Trip modal.
export async function TripView({ id }: { id: string }) {
  const supabase = await createClient();

  const { data: trip } = await supabase
    .from("trips")
    .select(
      "id, reference, title, status, starts_on, ends_on, nights, adults, children, visa_info, health_info, insurance_info, custom_notes, clients(id, client_code, full_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!trip) notFound();
  const client = one(trip.clients);

  const [{ data: quote }, { data: stays }, { data: destinations }] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, quote_versions(id, version_no, pdf_path, created_at)")
      .eq("trip_id", id)
      .order("version_no", { referencedTable: "quote_versions", ascending: false })
      .maybeSingle(),
    supabase
      .from("trip_stops")
      .select("id, destination_code, starts_on, ends_on, highlight")
      .eq("trip_id", id)
      .order("starts_on", { nullsFirst: false })
      .order("position"),
    supabase.from("destinations").select("code, name, country").order("name"),
  ]);
  const versions = quote?.quote_versions ?? [];

  // Private bucket: short-lived signed links for the Version PDFs.
  const pdfUrls = new Map<string, string>();
  const pdfPaths = versions.flatMap((v) => (v.pdf_path ? [v.pdf_path] : []));
  if (pdfPaths.length > 0) {
    const { data: signed } = await supabase.storage.from("quote-files").createSignedUrls(pdfPaths, 3600);
    signed?.forEach((s) => {
      if (s.path && s.signedUrl) pdfUrls.set(s.path, s.signedUrl);
    });
  }
  const versionLine = (v: (typeof versions)[number]) => (
    <>
      {trip.reference} V{v.version_no} · {new Date(v.created_at).toLocaleDateString("en-ZA")} ·{" "}
      {v.pdf_path && pdfUrls.get(v.pdf_path) ? (
        <a href={pdfUrls.get(v.pdf_path)} target="_blank" rel="noreferrer">
          Open PDF
        </a>
      ) : (
        "No PDF yet"
      )}
    </>
  );

  const destinationOptions = (destinations ?? []).map((d) => ({ code: d.code, label: `${d.name}, ${d.country}` }));

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

      <TripForm trip={trip} />

      <h2>Stays</h2>
      <p className="sub">The Trip's itinerary. Accommodation options are placed in these.</p>
      <table className="stays">
        <thead>
          <tr>
            <th>Destination</th>
            <th>Arrive</th>
            <th>Depart</th>
            <th>Highlight</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(stays ?? []).map((s) => (
            <StayRow key={s.id} tripId={trip.id} stay={s} destinations={destinationOptions} />
          ))}
          <StayRow key={`new-${stays?.length ?? 0}`} tripId={trip.id} destinations={destinationOptions} />
        </tbody>
      </table>

      <h2>Quote</h2>
      {quote && (
        <p>
          <Link href={`/quotes/${quote.id}`}>Open quote</Link>
        </p>
      )}
      {versions.length === 0 && <p className="empty">No versions yet.</p>}
      {versions.length > 0 && <p>Latest: {versionLine(versions[0])}</p>}
      {versions.length > 1 && (
        <details>
          <summary>Previous versions ({versions.length - 1})</summary>
          <ul>
            {versions.slice(1).map((v) => (
              <li key={v.id}>{versionLine(v)}</li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
