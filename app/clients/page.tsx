import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { canEdit, getProfile } from "@/lib/auth";
import { one } from "@/lib/relations";
import { ClientFilters } from "./client-filters";
import { Badge, BUTTON, Msg } from "@/app/ui";

export const dynamic = "force-dynamic";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ consultant?: string }> }) {
  const me = await getProfile();
  if (!me) redirect("/login");
  // Standard users start on their own Clients; "all" is everyone's.
  const consultant = ((await searchParams).consultant ?? (me.role === "user" ? me.id : "all")).replace(/^all$/, "");

  const supabase = await createClient();
  let query = supabase
    .from("clients")
    .select("id, client_code, full_name, email, phone, active, profiles!clients_consultant_id_fkey(full_name, email)")
    .order("sort_name");
  if (consultant) query = query.eq("consultant_id", consultant);
  const [{ data: clients, error }, { data: consultants }] = await Promise.all([
    query,
    supabase.from("profiles").select("id, full_name, email").in("role", ["user", "admin"]).order("full_name"),
  ]);

  return (
    <main className="mx-auto my-8 max-w-[1200px] px-5">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h1 className="mb-0">Clients</h1>
        {canEdit(me.role) && (
          <Link href="/clients/new" className={BUTTON.primary}>
            Add client
          </Link>
        )}
      </div>

      <ClientFilters
        consultants={(consultants ?? []).map((p) => ({ id: p.id, label: p.full_name ?? p.email }))}
        consultant={consultant}
      />

      {error && <Msg tone="error">Could not load clients: {error.message}</Msg>}
      {clients && clients.length === 0 && <p className="py-3 text-muted">No clients match this filter.</p>}
      {clients && clients.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Consultant</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => {
              const consultant = one(c.profiles);
              return (
                <tr key={c.id} className="hover:bg-paper">
                  <td>
                    <Link href={`/clients/${c.id}`}>
                      <b>{c.client_code}</b>
                    </Link>
                  </td>
                  <td>
                    {c.full_name}
                    {!c.active && <Badge className="ml-2">Inactive</Badge>}
                  </td>
                  <td>{c.email ?? "—"}</td>
                  <td>{c.phone ?? "—"}</td>
                  <td>{consultant?.full_name ?? consultant?.email ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
