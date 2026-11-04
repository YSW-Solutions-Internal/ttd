import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/auth";
import { one } from "@/lib/relations";
import { CorrectForm, CountryList, MergeForm, RemoveForm, type DestinationRow } from "./destination-forms";
import { Msg } from "@/app/ui";

export const dynamic = "force-dynamic";

export default async function DestinationsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdminPage();
  const q = ((await searchParams).q ?? "").trim();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("destinations")
    .select("code, name, country, created_at, profiles(full_name, email), trip_stops(count)")
    .order("name");
  const rows = (data ?? []).map((d) => {
    const by = one(d.profiles) as { full_name: string | null; email: string } | null;
    return {
      code: d.code as string,
      name: d.name as string,
      country: d.country as string,
      stays: (d.trip_stops as { count: number }[])[0]?.count ?? 0,
      // Seeded rows have no author.
      added: by ? `${by.full_name || by.email}, ${new Date(d.created_at).toLocaleDateString("en-ZA")}` : "Seeded",
    };
  });
  const needle = q.toLowerCase();
  const shown = needle ? rows.filter((d) => `${d.name} ${d.country} ${d.code}`.toLowerCase().includes(needle)) : rows;

  return (
    <main className="mx-auto my-8 max-w-[1200px] px-5">
      <h1>Destinations</h1>
      <p className="mb-4 text-muted">
        Any User adds a Destination from a Stay. Correct one here and every Stay there shows it; merge a duplicate
        into the right one to move its Stays across. Generated Versions keep what they said. The country sets the
        Fee region, so changing it changes the fees on each Stay&apos;s next Version.
      </p>
      <form className="mb-4">
        <input type="search" name="q" aria-label="Filter destinations" placeholder="Filter by name, country or code" defaultValue={q} />
      </form>
      {error && <Msg tone="error">Could not load Destinations: {error.message}</Msg>}
      {!error && shown.length === 0 && <p className="py-3 text-muted">No Destinations{q ? " match" : " yet"}.</p>}
      {shown.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name and country</th>
              <th>Stays</th>
              <th>Added</th>
              <th>Duplicate of</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((d: DestinationRow & { added: string }) => (
              <tr key={d.code}>
                <td className="font-mono">{d.code}</td>
                <td><CorrectForm d={d} /></td>
                <td>{d.stays}</td>
                <td>{d.added}</td>
                <td>
                  <MergeForm d={d} others={rows.filter((o) => o.code !== d.code)} />
                  <RemoveForm d={d} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <CountryList />
    </main>
  );
}
