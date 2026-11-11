import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { TABLE_KIND, type ItemTable } from "@/lib/extraction/tables";
import { ITEM_LABEL } from "@/app/quotes/[id]/item-fields";
import { Msg } from "@/app/ui";

export const dynamic = "force-dynamic";

const GROUPS = [
  { key: "trip", label: "Trips" },
  { key: "client", label: "Clients" },
  { key: "traveller", label: "Travellers" },
  { key: "booking", label: "Bookings" },
  { key: "invoice", label: "Invoices" },
] as const;
const LIMIT = 20;

// One row of search() (migration 0031).
type Hit = { grp: string; trip_id: string | null; client_id: string; reference: string; name: string; kind: string | null; matched: string | null };

const kindLabel = (kind: string) => {
  const table = (Object.keys(TABLE_KIND) as ItemTable[]).find((t) => TABLE_KIND[t] === kind);
  return table ? ITEM_LABEL[table].replace(/ option$/, "") : kind;
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; all?: string }> }) {
  if (!(await getProfile())) redirect("/login");
  const { q: raw = "", all } = await searchParams;
  const q = raw.trim();

  const supabase = await createClient();
  const { data, error } = q.length >= 2 ? await supabase.rpc("search", { p_q: q }) : { data: null, error: null };
  const rows: Hit[] = data ?? [];

  return (
    <main className="mx-auto my-8 max-w-[1200px] px-5">
      <h1>Search</h1>
      <form action="/search" className="mb-5 flex gap-2">
        <input type="search" name="q" defaultValue={q} aria-label="Search" className="w-full max-w-md" autoFocus />
      </form>

      {q.length < 2 && <p className="text-muted">Type at least 2 characters.</p>}
      {error && <Msg tone="error">Could not search: {error.message}</Msg>}
      {data && rows.length === 0 && <p className="text-muted">Nothing matches “{q}”.</p>}

      {GROUPS.map((g) => {
        const hits = rows.filter((r) => r.grp === g.key);
        if (hits.length === 0) return null;
        const shown = all === g.key ? hits : hits.slice(0, LIMIT);
        return (
          <section key={g.key} className="mb-6">
            <h2>
              {g.label} <span className="text-muted">({hits.length})</span>
            </h2>
            <ul className="list-none p-0">
              {shown.map((r, i) => (
                <li key={i} className="border-b border-line py-1.5">
                  <Link href={r.trip_id ? `/trips/${r.trip_id}` : `/clients/${r.client_id}`}>
                    <b>{g.key === "traveller" ? r.name : r.reference}</b>
                  </Link>{" "}
                  <span className="text-muted">
                    {g.key === "traveller"
                      ? `${r.reference} · ${r.matched}`
                      : [r.name, r.kind && kindLabel(r.kind), r.matched].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
            {shown.length < hits.length && (
              <p className="text-sm text-muted">
                Showing {LIMIT} of {hits.length}, narrow your search or{" "}
                <Link href={`/search?${new URLSearchParams({ q, all: g.key })}`}>show all {hits.length}</Link>.
              </p>
            )}
          </section>
        );
      })}
    </main>
  );
}
