import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { canEdit, getProfile } from "@/lib/auth";
import { one } from "@/lib/relations";
import { isTripStatus, OPEN_STATUSES, tripStatusLabel } from "@/lib/trip-status";
import { TripFilters } from "./trip-filters";

export const dynamic = "force-dynamic";

type Params = { status?: string; client?: string; consultant?: string; sort?: string; dir?: string };

const COLUMNS = [
  { key: "reference", label: "Reference" },
  { key: "title", label: "Trip" },
  { key: "client", label: "Client" },
  { key: "consultant", label: "Consultant" },
  { key: "status", label: "Status" },
  { key: "starts_on", label: "Starts" },
  { key: "created_at", label: "Created" },
] as const;

export default async function HomePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const me = await getProfile();
  if (!me) redirect("/login");
  const status = params.status === "all" || isTripStatus(params.status) ? params.status : "open";
  // Standard users start on their own Clients' Trips; "all" is everyone's.
  const consultant = (params.consultant ?? (me.role === "user" ? me.id : "all")).replace(/^all$/, "");
  const sort = COLUMNS.some((c) => c.key === params.sort && !("unsortable" in c)) ? params.sort! : "created_at";
  const dir = params.dir === "asc" || params.dir === "desc" ? params.dir : sort === "created_at" ? "desc" : "asc";

  const supabase = await createClient();
  // Inactive clients included, so their older trips can still be found.
  let clientQuery = supabase.from("clients").select("id, client_code, full_name").order("sort_name");
  if (consultant) clientQuery = clientQuery.eq("consultant_id", consultant);
  const [{ data: clients }, { data: consultants }] = await Promise.all([
    clientQuery,
    supabase.from("profiles").select("id, full_name, email").in("role", ["user", "admin"]).order("full_name"),
  ]);
  // A client that isn't the chosen Consultant's would only ever show an empty list, so drop it.
  const client = (clients ?? []).some((c) => c.id === params.client) ? params.client! : "";

  // A Trip's Consultant is its Client's current Consultant (GLOSSARY), not trips.consultant_id.
  let query = supabase
    .from("trips")
    .select(
      "id, reference, title, status, starts_on, created_at, clients!inner(client_code, full_name, consultant_id, profiles!clients_consultant_id_fkey(full_name, email))",
    );
  if (status === "open") query = query.in("status", OPEN_STATUSES);
  else if (status !== "all") query = query.eq("status", status);
  if (client) query = query.eq("client_id", client);
  if (consultant) query = query.eq("clients.consultant_id", consultant);
  const { data: trips, error } = await query;

  const consultantName = (t: NonNullable<typeof trips>[number]) => {
    const p = one(one(t.clients)?.profiles);
    return p ? (p.full_name ?? p.email) : "";
  };

  // shortcut: sorts in memory because every matching trip is loaded; move into the query when pagination arrives.
  const value = (t: NonNullable<typeof trips>[number]): string =>
    sort === "client"
      ? (one(t.clients)?.full_name ?? "")
      : sort === "consultant"
        ? consultantName(t)
        : ((t[sort as keyof typeof t] as string | null) ?? "");
  const rows = (trips ?? []).sort((a, b) => {
    const [x, y] = [value(a), value(b)];
    if (!x !== !y) return x ? -1 : 1; // blanks last, whichever way
    return (dir === "asc" ? 1 : -1) * x.localeCompare(y, "en", { sensitivity: "base" });
  });

  const href = (col: string) => {
    const q = new URLSearchParams({ status, sort: col, dir: sort === col && dir === "asc" ? "desc" : "asc" });
    if (client) q.set("client", client);
    q.set("consultant", consultant || "all");
    return `/?${q}`;
  };

  return (
    <main className="container">
      <h1>Trips</h1>
      {canEdit(me.role) && (
        <p className="sub">
          <Link href="/trips/new">+ New trip</Link>
        </p>
      )}

      <TripFilters
        clients={clients ?? []}
        consultants={(consultants ?? []).map((p) => ({ id: p.id, label: p.full_name ?? p.email }))}
        status={status}
        client={client}
        consultant={consultant}
        sort={sort}
        dir={dir}
      />

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
                  <td>{consultantName(t) || "—"}</td>
                  <td>{tripStatusLabel(t.status)}</td>
                  <td>{t.starts_on ? new Date(t.starts_on).toLocaleDateString("en-ZA") : "—"}</td>
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
