import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/auth";
import { MergeForm, RenameForm } from "./supplier-forms";
import { Msg } from "@/app/ui";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  await requireAdminPage();
  const supabase = await createClient();
  const { data, error } = await supabase.from("suppliers").select("id, name, item_bookings(count)").order("name");
  const rows = (data ?? []).map((s) => ({ id: s.id as string, name: s.name as string, bookings: (s.item_bookings as { count: number }[])[0]?.count ?? 0 }));

  return (
    <main className="mx-auto my-8 max-w-[1200px] px-5">
      <h1>Suppliers</h1>
      <p className="mb-4 text-muted">
        Any User adds a Supplier when booking. Correct a name here and every booking shows it; merge a duplicate
        into the right one to move its bookings across.
      </p>
      {error && <Msg tone="error">Could not load Suppliers: {error.message}</Msg>}
      {!error && rows.length === 0 && <p className="py-3 text-muted">No Suppliers yet.</p>}
      {rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Bookings</th>
              <th>Duplicate of</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td><RenameForm id={s.id} name={s.name} /></td>
                <td>{s.bookings}</td>
                <td><MergeForm id={s.id} others={rows.filter((o) => o.id !== s.id)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
