import { createClient } from "@/lib/supabase/server";
import { ITEM_LABEL } from "@/app/quotes/[id]/item-fields";

const LABEL: Record<string, string> = {
  ...ITEM_LABEL,
  clients: "Client",
  client_documents: "Client document",
  trips: "Trip",
  trip_stops: "Stay",
  quotes: "Quote",
  quote_versions: "Version",
  images: "Image",
  item_bookings: "Booking",
  item_changes: "Change",
  suppliers: "Supplier",
  flights: "Flight",
  travellers: "Traveller",
  trip_travellers: "Traveller on this Trip",
  identity_documents: "ID or Passport",
};

// Links between records, not something staff edit.
const HIDDEN = new Set(["id", "created_at", "updated_at", "entity_id", "quote_id", "trip_id", "client_id", "flight_option_id", "traveller_id", "image_path"]);

const show = (v: unknown) => {
  const s = v === null || v === undefined || v === "" ? "—" : typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 80 ? `${s.slice(0, 79)}…` : s;
};

/** History (GLOSSARY) of one Trip and everything under it, or of one Client's own record, documents and Travellers. */
export async function History(filter: { tripId: string } | { clientId: string }) {
  const supabase = await createClient();
  let query = supabase.from("history").select("id, at, user_id, table_name, action, before, after");
  query =
    "tripId" in filter
      ? query.eq("trip_id", filter.tripId)
      : query.eq("client_id", filter.clientId).in("table_name", ["clients", "client_documents", "travellers", "identity_documents"]);
  // shortcut: newest 200 only; page through older entries if a Trip ever has more.
  const { data: entries, error } = await query.order("at", { ascending: false }).limit(200);

  const ids = [...new Set((entries ?? []).flatMap((e) => (e.user_id ? [e.user_id] : [])))];
  const { data: people } = ids.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", ids)
    : { data: [] };
  const who = new Map((people ?? []).map((p) => [p.id, p.full_name ?? p.email]));

  return (
    <details className="history">
      <summary>History ({entries?.length ?? 0})</summary>
      {error && <div className="msg error">Could not load History: {error.message}</div>}
      {entries && entries.length === 0 && <p className="empty">No edits recorded yet.</p>}
      {entries && entries.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>What</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const label = LABEL[e.table_name] ?? e.table_name.replaceAll("_", " ");
              const changed = Object.keys(e.after ?? {}).filter((k) => !HIDDEN.has(k));
              return (
                <tr key={e.id}>
                  <td>{new Date(e.at).toLocaleString("en-ZA")}</td>
                  <td>{e.user_id ? (who.get(e.user_id) ?? "Former user") : "System"}</td>
                  <td>
                    {e.action === "insert" && `Added ${label}`}
                    {e.action === "delete" && `Removed ${label}`}
                    {e.action === "update" && (
                      <>
                        Changed {label}
                        <ul>
                          {changed.map((k) => (
                            <li key={k}>
                              {k.replaceAll("_", " ")}: {show(e.before?.[k])} → {show(e.after?.[k])}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </details>
  );
}
