import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/auth";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { InviteUserForm, RoleForm } from "./user-forms";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  created_at: string;
};

export default async function UsersPage() {
  // Redirects anyone who is not an admin before anything here renders.
  const me = await requireAdminPage();

  const supabase = await createClient();
  const { data: users, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .order("created_at", { ascending: true });

  const rows = (users ?? []) as Row[];

  return (
    <main className="container">
      <h1>Users</h1>
      <p className="sub">
        Accounts are by invitation only. Administrators invite staff and change roles,
        including promoting someone to administrator. Standard users cannot reach this page.
      </p>

      <h2>Invite a user</h2>
      <InviteUserForm />

      <h2 style={{ marginTop: 28 }}>All users</h2>
      {error && <div className="msg error">Could not load users: {error.message}</div>}
      {!error && rows.length === 0 && <p className="empty">No users yet.</p>}
      {rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Added</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const isSelf = u.id === me.id;
              return (
                <tr key={u.id}>
                  <td>
                    {u.full_name ?? "—"}
                    {isSelf && <span className="badge" style={{ marginLeft: 8 }}>you</span>}
                  </td>
                  <td>{u.email}</td>
                  <td>
                    {isSelf ? (
                      <span className="badge ok">{ROLE_LABELS[u.role]}</span>
                    ) : (
                      <RoleForm userId={u.id} role={u.role} />
                    )}
                  </td>
                  <td>{new Date(u.created_at).toLocaleDateString("en-ZA")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
