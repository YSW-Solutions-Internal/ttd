import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/relations";
import { Msg } from "./ui";

const fmt = (d: string) => new Date(d).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
const count = (n: number, single: string, many: string) => `${n} ${n === 1 ? single : many}`;

/** Booked Trips starting or ending in the next 7 days (today included, South African time). */
export async function Departures({ today, consultant }: { today: string; consultant: string }) {
  const week = new Date(Date.parse(today) + 6 * 864e5).toISOString().slice(0, 10);
  const supabase = await createClient();
  let query = supabase
    .from("trips")
    .select("id, reference, starts_on, ends_on, adults, children, clients!inner(full_name, consultant_id), trip_travellers(travellers(first_name, last_name))")
    .eq("status", "booked")
    .or(`and(starts_on.gte.${today},starts_on.lte.${week}),and(ends_on.gte.${today},ends_on.lte.${week})`);
  if (consultant) query = query.eq("clients.consultant_id", consultant);
  const { data: trips, error } = await query;
  if (error) return <Msg tone="error">Could not load departures: {error.message}</Msg>;

  type Trip = NonNullable<typeof trips>[number];
  const who = (t: Trip) => {
    const names = (t.trip_travellers ?? []).map((x) => one(x.travellers)).filter((v) => !!v).map((v) => `${v.first_name} ${v.last_name}`);
    if (names.length) return names.join(", ");
    return [count(t.adults, "adult", "adults"), t.children ? count(t.children, "child", "children") : ""].filter(Boolean).join(", ");
  };
  const list = (on: "starts_on" | "ends_on") =>
    (trips ?? []).filter((t) => t[on] && t[on] >= today && t[on] <= week).sort((a, b) => a[on]!.localeCompare(b[on]!));
  const lists = [
    { title: "Departing", on: "starts_on" as const, rows: list("starts_on") },
    { title: "Returning", on: "ends_on" as const, rows: list("ends_on") },
  ];

  return (
    <section className="mb-6 rounded border border-line bg-white p-4">
      <h2 className="mt-0">This week</h2>
      {lists.every((l) => l.rows.length === 0) ? (
        <p className="mb-0 text-muted">Nothing departing or returning in the next 7 days.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {lists.map((l) => (
            <div key={l.title}>
              <h3 className="mt-0">{l.title}</h3>
              {l.rows.length === 0 ? (
                <p className="text-muted">None.</p>
              ) : (
                <ul className="m-0 list-none p-0">
                  {l.rows.map((t) => (
                    <li key={t.id} className="border-b border-line py-1.5">
                      <span className="inline-block w-24">{fmt(t[l.on]!)}</span>
                      <Link href={`/trips/${t.id}`}>
                        <b>{t.reference}</b>
                      </Link>{" "}
                      {one(t.clients)?.full_name}
                      <div className="ml-24 text-sm text-muted">{who(t)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
