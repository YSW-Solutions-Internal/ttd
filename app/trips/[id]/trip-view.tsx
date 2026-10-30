import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canEdit, getProfile } from "@/lib/auth";
import { History } from "@/app/history";
import { one } from "@/lib/relations";
import { problems } from "@/lib/pdf/assemble";
import { TABS } from "@/app/quotes/[id]/edit-section";
import { ITEM_LABEL } from "@/app/quotes/[id]/item-fields";
import { StayRow } from "./stays-form";
import { TripForm } from "./trip-form";
import { AddTravellerForm } from "@/app/clients/travellers";
import { addToTrip, removeFromTrip } from "@/app/clients/traveller-actions";
import { Invoices } from "./invoices";
import { loadBillables } from "./invoicing-data";
import { FileLink } from "@/app/file-viewer";
import { Badge, BUTTON, Button, Msg, TripStatusBadge } from "@/app/ui";
import { StaysArc } from "./stays-arc";
import { QuoteEditor } from "@/app/quotes/[id]/quote-view";

const date = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-ZA") : null);

// Shared by the full Trip page and the Trip modal.
export async function TripView({ id }: { id: string }) {
  const supabase = await createClient();
  const me = await getProfile();
  const editable = !!me && canEdit(me.role);

  const { data: trip } = await supabase
    .from("trips")
    .select(
      "id, reference, title, status, starts_on, ends_on, nights, adults, children, visa_info, health_info, insurance_info, custom_notes, ta_number, cost_centre, authorising_person, clients(id, client_code, full_name, kind, consultant_id)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!trip) notFound();
  const client = one(trip.clients);

  const [{ data: quote }, { data: stays }, { data: destinations }, { data: travellers }, { data: onTrip }, { data: flags }] = await Promise.all([
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
    supabase.from("travellers").select("id, first_name, last_name, date_of_birth").eq("client_id", client?.id).order("last_name").order("first_name"),
    supabase.from("trip_travellers").select("traveller_id").eq("trip_id", id).order("created_at"),
    supabase.from("traveller_flags").select("traveller_id, identified").eq("client_id", client?.id),
  ]);
  const going = new Set((onTrip ?? []).map((r) => r.traveller_id));
  const unidentified = new Set((flags ?? []).filter((f) => !f.identified).map((f) => f.traveller_id));
  const tripTravellers = (travellers ?? []).filter((t) => going.has(t.id));
  const others = (travellers ?? []).filter((t) => !going.has(t.id));
  const headCount = trip.adults + trip.children;
  const versions = quote?.quote_versions ?? [];

  // The Quote's Items, as Generate version sees them: quote_items leaves out removed images' Items.
  const [{ data: active }, ...tables] = quote
    ? await Promise.all([
        supabase.from("quote_items").select("entity_id").eq("quote_id", quote.id),
        ...TABS.map(([t]) => supabase.from(t).select("*").eq("quote_id", quote.id).order("created_at")),
      ])
    : [{ data: [] }];
  const keep = new Set((active ?? []).map((r) => r.entity_id));
  const items = Object.fromEntries(
    TABS.map(([t], i) => [t, (tables[i]?.data ?? []).filter((r) => keep.has(r.entity_id))]),
  ) as Record<(typeof TABS)[number][0], Record<string, unknown>[]>;
  const counts = TABS.flatMap(([t]) => {
    const n = items[t].length;
    return n > 0 ? [`${n} ${ITEM_LABEL[t]}${n === 1 ? "" : "s"}`] : [];
  });
  const blockers = quote ? problems({ ...items, flights: [] }) : [];

  const itemsById = new Map(
    TABS.flatMap(([t]) => items[t].map((row) => [String(row.entity_id), { row, label: [ITEM_LABEL[t], row.label ?? row.name].filter(Boolean).join(": ") }] as const)),
  );
  const billables = quote ? await loadBillables(supabase, quote.id, itemsById) : [];
  const admin = me?.role === "admin";
  const canAddInvoice = admin || ["booked", "travelled", "cancelled"].includes(trip.status) || client?.consultant_id === me?.id;

  // Private bucket: a short-lived signed link for the latest Version's PDF (the editor lists them all).
  const pdfUrls = new Map<string, string>();
  const pdfPaths = versions.slice(0, 1).flatMap((v) => (v.pdf_path ? [v.pdf_path] : []));
  if (pdfPaths.length > 0) {
    const { data: signed } = await supabase.storage.from("quote-files").createSignedUrls(pdfPaths, 3600);
    signed?.forEach((s) => {
      if (s.path && s.signedUrl) pdfUrls.set(s.path, s.signedUrl);
    });
  }
  const versionLine = (v: (typeof versions)[number]) => (
    <>
      {trip.reference} V{v.version_no}, {new Date(v.created_at).toLocaleDateString("en-ZA")}.{" "}
      {v.pdf_path && pdfUrls.get(v.pdf_path) ? (
        <FileLink href={pdfUrls.get(v.pdf_path)!} title={`${trip.reference} V${v.version_no}`}>
          Open PDF
        </FileLink>
      ) : (
        "No PDF yet"
      )}
    </>
  );

  const destinationName = new Map((destinations ?? []).map((d) => [d.code, d.name]));
  const destinationOptions = (destinations ?? []).map((d) => ({ code: d.code, label: `${d.name}, ${d.country}` }));

  return (
    <>
      <header className="mb-6 border-b border-line pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold text-muted tabular-nums">{trip.reference}</span>
          <TripStatusBadge status={trip.status} />
        </div>
        <h1 className="mt-1">{trip.title ?? "Untitled trip"}</h1>
        <p className="text-muted">
          For <Link href={`/clients/${client?.id}`}>{client?.full_name} ({client?.client_code})</Link>.{" "}
          {trip.starts_on ? `${date(trip.starts_on)} to ${date(trip.ends_on) ?? "?"}` : "No dates yet"}
          {trip.nights ? `, ${trip.nights} night${trip.nights === 1 ? "" : "s"}` : ""}.
        </p>
        <StaysArc
          stays={(stays ?? []).map((s) => ({ ...s, name: destinationName.get(s.destination_code ?? "") ?? "Destination to choose" }))}
        />
      </header>

      {quote && (
        <section aria-label="Quote summary" className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-md border border-line bg-white p-4">
          <div className="min-w-0">
            <p className="font-semibold">{counts.length > 0 ? counts.join(", ") : "No Items yet"}</p>
            {blockers.length > 0 && (
              <ul className="mt-1 list-none text-danger">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-muted">{versions.length > 0 ? <>Latest: {versionLine(versions[0])}</> : "No versions yet."}</p>
          </div>
          <a href="#quote" className={BUTTON.primary}>
            Go to the quote
          </a>
        </section>
      )}

      {/* Accountants see the Trip but cannot change it (ADR 0010). */}
      <fieldset className="min-w-0" disabled={!editable}>
      <TripForm trip={trip} company={client?.kind === "company"} />

      <h2 id="stays" className="scroll-mt-4">Stays</h2>
      <p className="mb-3 text-muted">The Trip's itinerary. Accommodation options are placed in these.</p>
      <table className="[&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top">
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
          {editable && <StayRow key={`new-${stays?.length ?? 0}`} tripId={trip.id} destinations={destinationOptions} />}
        </tbody>
      </table>

      <h2>Travellers</h2>
      {tripTravellers.length !== headCount && (
        <Msg tone="warn" className="mb-3">
          {tripTravellers.length} Traveller{tripTravellers.length === 1 ? "" : "s"} on this Trip, but {trip.adults} adult
          {trip.adults === 1 ? "" : "s"} and {trip.children} child{trip.children === 1 ? "" : "ren"} above.
        </Msg>
      )}
      {tripTravellers.length === 0 && <p className="py-3 text-muted">No Travellers on this Trip yet.</p>}
      {tripTravellers.length > 0 && (
        <table>
          <tbody>
            {tripTravellers.map((t) => (
              <tr key={t.id}>
                <td>
                  {t.first_name} {t.last_name}
                </td>
                <td>{t.date_of_birth ? date(t.date_of_birth) : "—"}</td>
                <td>{unidentified.has(t.id) && <Badge tone="danger">No ID or Passport</Badge>}</td>
                <td className="text-right">
                  <form action={removeFromTrip.bind(null, trip.id, t.id)}>
                    <Button type="submit" variant="danger">
                      Take off this Trip
                    </Button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editable && others.length > 0 && (
        <form action={addToTrip.bind(null, trip.id)} className="mt-3 flex items-center gap-2">
          <select name="traveller_id" aria-label="Traveller to add" required className="w-auto">
            {others.map((t) => (
              <option key={t.id} value={t.id}>
                {t.first_name} {t.last_name}
              </option>
            ))}
          </select>
          <button type="submit">Add to this Trip</button>
        </form>
      )}
      {editable && client && <AddTravellerForm clientId={client.id} tripId={trip.id} />}
      <p className="mt-3 text-muted">
        IDs and Passports are kept on the <Link href={`/clients/${client?.id}`}>Client page</Link>.
      </p>
      </fieldset>

      {quote && <QuoteEditor quoteId={quote.id} trip={trip} />}

      {quote && (
        <Invoices
          tripId={trip.id}
          quoteId={quote.id}
          billables={billables}
          canAdd={canAddInvoice}
          accounts={admin || me?.role === "accountant"}
          admin={admin}
        />
      )}

      <History tripId={trip.id} />
    </>
  );
}
