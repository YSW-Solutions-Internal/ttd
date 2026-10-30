import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { one } from "@/lib/relations";
import { awaitingQueue, STAGE_LABEL } from "@/lib/invoicing";
import { TABS } from "@/app/quotes/[id]/edit-section";
import { ITEM_LABEL } from "@/app/quotes/[id]/item-fields";
import { loadBillables, type Billable } from "@/app/trips/[id]/invoicing-data";
import { Badge, Msg } from "@/app/ui";

export const dynamic = "force-dynamic";

// The Accounts queues (GLOSSARY): read-only lists, each row opening its Trip, where the actions are.
const QUEUES = [
  { key: "awaiting", label: "Awaiting" },
  { key: "verify", label: "To verify" },
  { key: "invoice", label: "To invoice" },
  { key: "queries", label: "Queries" },
  { key: "unlinked", label: "Unlinked documents" },
] as const;
type Queue = (typeof QUEUES)[number]["key"];

type Trip = { id: string; reference: string; title: string | null };

const rand = (n: number) => `R ${n.toFixed(2)}`;
const money = (currency: string, n: number) => `${currency} ${n.toFixed(2)}`;
const round = (n: number) => Math.round(n * 100) / 100;

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ queue?: string }> }) {
  const me = await getProfile();
  if (!me) redirect("/login");
  if (me.role !== "admin" && me.role !== "accountant") redirect("/");
  const asked = (await searchParams).queue;
  const queue: Queue = QUEUES.some((q) => q.key === asked) ? (asked as Queue) : "awaiting";

  const supabase = await createClient();
  const [{ data: booked }, { data: invoices, error }] = await Promise.all([
    supabase.from("item_bookings").select("quote_id"),
    supabase
      .from("invoices")
      .select("id, side, number, issued_on, amount, currency, status, query_reason, suppliers(name), trips(id, reference, title, clients(full_name)), invoice_links(amount)")
      .order("issued_on")
      .order("created_at"),
  ]);

  // Every booked Item and Change, Quote by Quote, as the Trip page sees them.
  // shortcut: one loadBillables per booked Quote, fine for a few hundred; batch it if the page gets slow.
  const quoteIds = [...new Set((booked ?? []).map((b) => b.quote_id as string))];
  const [{ data: quotes }, ...tables] = quoteIds.length
    ? await Promise.all([
        supabase.from("quotes").select("id, trips(id, reference, title)").in("id", quoteIds),
        ...TABS.map(([t]) => supabase.from(t).select("*").in("quote_id", quoteIds)),
      ])
    : [{ data: [] }];
  const rows: (Billable & { trip: Trip })[] = (
    await Promise.all(
      (quotes ?? []).map(async (q) => {
        const items = new Map(
          TABS.flatMap(([t], i) =>
            (tables[i]?.data ?? [])
              .filter((row) => row.quote_id === q.id)
              .map((row) => [String(row.entity_id), { row, label: [ITEM_LABEL[t], row.label ?? row.name].filter(Boolean).join(": ") }] as const),
          ),
        );
        const trip = one(q.trips) as Trip;
        return (await loadBillables(supabase, q.id, items)).map((b) => ({ ...b, trip }));
      }),
    )
  ).flat();

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
  const awaiting = awaitingQueue(rows);
  const toInvoice = rows.filter((b) => b.toInvoice > 0).sort((a, b) => a.trip.reference.localeCompare(b.trip.reference));
  const docs = (invoices ?? []).map((i) => ({
    ...i,
    trip: one(i.trips),
    unlinked: round(Number(i.amount) - (i.invoice_links ?? []).reduce((a, l) => a + Number(l.amount), 0)),
  }));
  const toVerify = docs.filter((i) => i.status === "received");
  const queries = docs.filter((i) => i.status === "query");
  const unlinked = docs.filter((i) => i.unlinked !== 0);
  const counts: Record<Queue, number> = {
    awaiting: awaiting.length,
    verify: toVerify.length,
    invoice: toInvoice.length,
    queries: queries.length,
    unlinked: unlinked.length,
  };

  const tripLink = (t: { id: string; reference: string; title: string | null } | null) =>
    t ? <Link href={`/trips/${t.id}`}>{[t.reference, t.title].filter(Boolean).join(" · ")}</Link> : null;
  const party = (i: (typeof docs)[number]) => (i.side === "supplier" ? one(i.suppliers)?.name : one(i.trip?.clients)?.full_name);

  return (
    <main className="mx-auto my-8 max-w-[1200px] px-5">
      <h1>Accounts</h1>
      {error && <Msg tone="error">Could not load invoices: {error.message}</Msg>}
      <nav aria-label="Queues" className="mb-4 flex flex-wrap gap-1 border-b border-line">
        {QUEUES.map((q) => (
          <Link
            key={q.key}
            href={`/accounts?queue=${q.key}`}
            aria-current={q.key === queue ? "page" : undefined}
            className="-mb-px border-b-3 border-transparent px-3 py-2 text-ink hover:no-underline aria-[current=page]:border-teal aria-[current=page]:font-semibold aria-[current=page]:text-teal-deep"
          >
            {q.label} <Badge tone={counts[q.key] ? "teal" : "neutral"}>{counts[q.key]}</Badge>
          </Link>
        ))}
      </nav>

      {counts[queue] === 0 && <p className="py-3 text-muted">Nothing here.</p>}

      {queue === "awaiting" && awaiting.length > 0 && (
        <table>
          <thead>
            <tr><th>Expected</th><th>Trip</th><th>Item</th><th>Supplier</th></tr>
          </thead>
          <tbody>
            {awaiting.map((b) => (
              <tr key={`${b.trip.id}|${b.key}`}>
                <td>
                  {b.expectedOn ?? "Not set"} {b.expectedOn && b.expectedOn < today && <Badge tone="danger">Overdue</Badge>}
                </td>
                <td>{tripLink(b.trip)}</td>
                <td>{b.label}</td>
                <td>{b.supplierName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {queue === "invoice" && toInvoice.length > 0 && (
        <table>
          <thead>
            <tr><th>Trip</th><th>Item</th><th>Supplier side</th><th>To invoice</th></tr>
          </thead>
          <tbody>
            {toInvoice.map((b) => (
              <tr key={`${b.trip.id}|${b.key}`}>
                <td>{tripLink(b.trip)}</td>
                <td>{b.label}</td>
                <td><Badge>{STAGE_LABEL[b.stage]}</Badge></td>
                <td>{rand(b.toInvoice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(queue === "verify" || queue === "queries" || queue === "unlinked") && counts[queue] > 0 && (
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Number</th><th>From / to</th><th>Trip</th><th>Amount</th>
              {queue === "queries" && <th>Reason</th>}
              {queue === "unlinked" && <th>Not linked</th>}
            </tr>
          </thead>
          <tbody>
            {(queue === "verify" ? toVerify : queue === "queries" ? queries : unlinked).map((i) => (
              <tr key={i.id}>
                <td>{i.issued_on}</td>
                <td>
                  {i.number} {queue === "unlinked" && <Badge>{i.side === "supplier" ? "Supplier" : "Client"}</Badge>}
                </td>
                <td>{party(i)}</td>
                <td>{tripLink(i.trip)}</td>
                <td>{money(i.currency, Number(i.amount))}</td>
                {queue === "queries" && <td>{i.query_reason}</td>}
                {queue === "unlinked" && <td>{money(i.currency, i.unlinked)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
