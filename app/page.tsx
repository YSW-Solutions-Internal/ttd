import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/relations";
import { isTripStatus, tripStatusLabel } from "@/lib/trip-status";
import { TripFilters } from "./trip-filters";

export const dynamic = "force-dynamic";

type Params = { status?: string; client?: string; sort?: string; dir?: string };

const COLUMNS = [
  { key: "reference", label: "Reference" },
  { key: "title", label: "Trip" },
  { key: "client", label: "Client" },
  { key: "status", label: "Status" },
  { key: "starts_on", label: "Starts" },
  { key: "quotes", label: "Quotes", unsortable: true },
  { key: "created_at", label: "Created" },
] as const;

export default async function HomePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const status = params.status === "all" || isTripStatus(params.status) ? params.status : "in_progress";
  const client = params.client ?? "";
  const sort = COLUMNS.some((c) => c.key === params.sort && !("unsortable" in c)) ? params.sort! : "created_at";
  const dir = params.dir === "asc" || params.dir === "desc" ? params.dir : sort === "created_at" ? "desc" : "asc";

  const supabase = await createClient();
  // RLS (0007): trips of your own clients, or all of them for an admin.
  let query = supabase
    .from("trips")
    .select("id, reference, title, status, starts_on, created_at, quotes(id), clients(client_code, full_name)");
  if (status !== "all") query = query.eq("status", status);
  if (client) query = query.eq("client_id", client);

  // Inactive clients included, so their older trips can still be found.
  const [{ data: trips, error }, { data: clients }] = await Promise.all([
    query,
    supabase.from("clients").select("id, client_code, full_name").order("last_name").order("first_name"),
  ]);

  // shortcut: sorts in memory because every matching trip is loaded; move into the query when pagination arrives.
  const value = (t: NonNullable<typeof trips>[number]): string =>
    sort === "client" ? (one(t.clients)?.full_name ?? "") : ((t[sort as keyof typeof t] as string | null) ?? "");
  const rows = (trips ?? []).sort((a, b) => {
    const [x, y] = [value(a), value(b)];
    if (!x !== !y) return x ? -1 : 1; // blanks last, whichever way
    return (dir === "asc" ? 1 : -1) * x.localeCompare(y, "en", { sensitivity: "base" });
  });

  const href = (col: string) => {
    const q = new URLSearchParams({ status, sort: col, dir: sort === col && dir === "asc" ? "desc" : "asc" });
    if (client) q.set("client", client);
    return `/?${q}`;
  };

  return (
    <main className="container">
      <h1>Trips</h1>
      <p className="sub">
        <Link href="/trips/new">+ New trip</Link>
      </p>

      <TripFilters clients={clients ?? []} status={status} client={client} sort={sort} dir={dir} />

      {error && <div className="msg error">Could not load trips: {error.message}</div>}
      {trips && rows.length === 0 && <p className="empty">No trips match.</p>}
      {rows.length > 0 && (
        <table>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} aria-sort={sort === c.key ? (dir === "asc" ? "ascending" : "descending") : undefined}>
                  {"unsortable" in c ? (
                    c.label
                  ) : (
                    <Link href={href(c.key)} className="sort">
                      {c.label}
                      {sort === c.key ? (dir === "asc" ? " ▲" : " ▼") : ""}
                    </Link>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const c = one(t.clients);
              return (
                <tr key={t.id}>
                  <td>
                    <Link href={`/trips/${t.id}`}>
                      <b>{t.reference}</b>
                    </Link>
                  </td>
                  <td>{t.title ?? "—"}</td>
                  <td>
                    {c?.full_name ?? "—"}
                    <div className="sub" style={{ margin: 0, fontSize: 12 }}>{c?.client_code}</div>
                  </td>
                  <td>{tripStatusLabel(t.status)}</td>
                  <td>{t.starts_on ? new Date(t.starts_on).toLocaleDateString("en-ZA") : "—"}</td>
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
