import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/relations";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const supabase = await createClient();
  // RLS (0007): standard users get only their own clients, admins get all.
  const { data: clients, error } = await supabase
    .from("clients")
    .select("id, client_code, full_name, email, phone, active, profiles!clients_consultant_id_fkey(full_name, email)")
    .order("last_name")
    .order("first_name");

  return (
    <main className="container">
      <h1>Clients</h1>
      <p className="sub">
        <Link href="/clients/new">+ Add client</Link>
      </p>

      {error && <div className="msg error">Could not load clients: {error.message}</div>}
      {clients && clients.length === 0 && <p className="empty">No clients yet.</p>}
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
                <tr key={c.id}>
                  <td>
                    <Link href={`/clients/${c.id}`}>
                      <b>{c.client_code}</b>
                    </Link>
                  </td>
                  <td>
                    {c.full_name}
                    {!c.active && <span className="badge" style={{ marginLeft: 8 }}>inactive</span>}
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
