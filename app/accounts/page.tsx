import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { everyRow, one } from "@/lib/relations";
import { awaitingQueue, STAGE_LABEL } from "@/lib/invoicing";
import { TABLE_KIND } from "@/lib/extraction/tables";
import { TABS } from "@/app/quotes/[id]/edit-section";
import { ITEM_LABEL } from "@/app/quotes/[id]/item-fields";
import { loadBillables, type Billable } from "@/app/trips/[id]/invoicing-data";
import { Badge, BUTTON } from "@/app/ui";
import { PAYMENT_KIND_LABEL, type PaymentKind } from "@/lib/payments";
import { REFUND_STATUS_LABEL, type RefundStatus } from "@/lib/refunds";
import { loadCommissionQueue, loadRefundQueue } from "./refunds-data";

export const dynamic = "force-dynamic";

// The Accounts queues (GLOSSARY): read-only lists, each row opening its Trip's accounts page, where the actions are.
const QUEUES = [
  { key: "awaiting", label: "Awaiting" },
  { key: "verify", label: "To verify" },
  { key: "invoice", label: "To invoice" },
  { key: "reconcile", label: "To reconcile" },
  { key: "queries", label: "Queries" },
  { key: "unlinked", label: "Unlinked documents" },
  { key: "refunds", label: "Refunds" },
  { key: "commissions", label: "Commissions owed" },
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
  const [quotes, invoices, payments, { data: statements }, refunds, commissions] = await Promise.all([
    // Booked Quotes only (inner join), each with its Item rows (every table in TABS).
    everyRow((from, to) =>
      supabase
        .from("quotes")
        .select("id, trips(id, reference, title), item_bookings!inner(entity_id), flight_options(*), accommodation_options(*), excursions(*), transfers(*), rail_journeys(*), car_rentals(*)")
        .order("id")
        .range(from, to),
    ),
    everyRow((from, to) =>
      supabase
        .from("invoices")
        .select("id, side, number, issued_on, amount, currency, status, query_reason, suppliers(name), trips(id, reference, title, clients(full_name)), invoice_links(amount)")
        .order("issued_on")
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    everyRow((from, to) =>
      supabase
        .from("payments")
        .select("id, side, kind, paid_on, amount, currency, status, query_reason, reverses_id, suppliers(name), trips(id, reference, title, clients(full_name)), payment_links(amount)")
        .order("paid_on")
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    // The accounts with a statement of their own (ADR 0013).
    supabase.from("payment_accounts").select("id, nickname, retired_at, clients(full_name)").or("client_id.is.null,kind.eq.card").order("nickname"),
    loadRefundQueue(),
    loadCommissionQueue(),
  ]);

  // Every booked Item and Change, Quote by Quote, as the Trip page sees them.
  // shortcut: one loadBillables per booked Quote, fine for a few hundred; batch it if the page gets slow.
  const rows: (Billable & { trip: Trip })[] = (
    await Promise.all(
      quotes.map(async (q) => {
        const items = new Map(
          TABS.flatMap(([t]) =>
            (((q as Record<string, unknown>)[t] ?? []) as Record<string, unknown>[]).map(
              (row) => [String(row.entity_id), { row, kind: TABLE_KIND[t], label: [ITEM_LABEL[t], row.label ?? row.name].filter(Boolean).join(": ") }] as const,
            ),
          ),
        );
        const trip = one(q.trips) as Trip;
        return (await loadBillables(supabase, q.id, items, false)).map((b) => ({ ...b, trip }));
      }),
    )
  ).flat();

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
  const awaiting = awaitingQueue(rows);
  const toInvoice = rows.filter((b) => b.toInvoice !== 0).sort((a, b) => a.trip.reference.localeCompare(b.trip.reference));
  // Invoices and Payments, in one shape for the lists they share.
  const reversed = new Set(payments.flatMap((p) => (p.reverses_id ? [p.reverses_id] : [])));
  const docs = [
    ...invoices.map((i) => ({
      id: i.id,
      payment: false,
      kind: null as string | null,
      side: i.side,
      date: i.issued_on,
      what: i.number,
      party: i.side === "supplier" ? one(i.suppliers)?.name : one(one(i.trips)?.clients)?.full_name,
      trip: one(i.trips),
      amount: Number(i.amount),
      currency: i.currency,
      status: i.status,
      query_reason: i.query_reason,
      unlinked: round(Number(i.amount) - (i.invoice_links ?? []).reduce((a, l) => a + Number(l.amount), 0)),
    })),
    ...payments.map((p) => ({
      id: p.id,
      payment: true,
      kind: p.kind as string | null,
      side: p.side,
      date: p.paid_on,
      what: p.reverses_id ? "Reversal" : PAYMENT_KIND_LABEL[p.kind as PaymentKind],
      party: p.side === "supplier" ? one(p.suppliers)?.name : one(one(p.trips)?.clients)?.full_name,
      trip: one(p.trips),
      amount: Number(p.amount),
      currency: p.currency,
      status: p.status,
      query_reason: p.query_reason,
      // A reversal and what it reverses cancel out, links and all.
      unlinked: p.reverses_id || reversed.has(p.id) ? 0 : round(Number(p.amount) - (p.payment_links ?? []).reduce((a, l) => a + Number(l.amount), 0)),
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const toVerify = docs.filter((i) => !i.payment && i.status === "received");
  const toReconcile = docs.filter((i) => i.payment && i.status === "unreconciled");
  const queries = docs.filter((i) => i.status === "query");
  const unlinked = docs.filter((i) => i.unlinked !== 0);
  const counts: Record<Queue, number> = {
    awaiting: awaiting.length,
    verify: toVerify.length,
    invoice: toInvoice.length,
    reconcile: toReconcile.length,
    queries: queries.length,
    unlinked: unlinked.length,
    refunds: refunds.length,
    commissions: commissions.length,
  };

  const tripLink = (t: { id: string; reference: string; title: string | null } | null) =>
    t ? <Link href={`/trips/${t.id}/accounts`}>{[t.reference, t.title].filter(Boolean).join(" · ")}</Link> : null;

  return (
    <main className="mx-auto my-8 max-w-[1200px] px-5">
      <h1>Accounts</h1>
      {(statements ?? []).length > 0 && (
        <p className="mb-4">
          Statements:{" "}
          {(statements ?? []).map((a, n) => (
            <span key={a.id}>
              {n > 0 && " · "}
              <Link href={`/accounts/statements/${a.id}`}>
                {one(a.clients) ? `${one(a.clients)?.full_name}: ` : ""}
                {a.nickname}
              </Link>
              {a.retired_at && " (retired)"}
            </span>
          ))}
        </p>
      )}
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
                <td>
                  {b.toInvoice < 0 ? <>{rand(-b.toInvoice)} <Badge tone="danger">Credit note due</Badge></> : rand(b.toInvoice)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(queue === "refunds" || queue === "commissions") && counts[queue] > 0 && (
        <p className="mb-3">
          <a className={BUTTON.primary} href={`/accounts/${queue}/csv`} download>
            Download CSV
          </a>
        </p>
      )}

      {queue === "refunds" && refunds.length > 0 && (
        <table>
          <thead>
            <tr><th>Requested</th><th>Trip</th><th>Booking</th><th>Status</th><th>Approved</th><th>Received</th><th>Due back</th><th>Paid back</th></tr>
          </thead>
          <tbody>
            {refunds.map((r) => (
              <tr key={r.change_id}>
                <td>{r.since}</td>
                <td>{tripLink(r.trip)}</td>
                <td>{r.supplierName} {r.booking_reference}</td>
                <td>
                  <Badge>{REFUND_STATUS_LABEL[r.status as RefundStatus]}</Badge> {r.outOfPocket && <Badge tone="danger">Out of pocket</Badge>}
                </td>
                <td>{rand(r.approved)}</td>
                <td>{rand(r.received)}</td>
                <td>{rand(r.dueBack)}</td>
                <td>{rand(r.paid_back)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {queue === "commissions" && commissions.length > 0 && (
        <table>
          <thead>
            <tr><th>Due</th><th>Trip</th><th>Booking</th><th>Commission</th><th>Received</th><th>Owed</th><th>Claim</th></tr>
          </thead>
          <tbody>
            {commissions.map((c) => (
              <tr key={`${c.quote_id}|${c.entity_id}`}>
                <td>
                  {c.commission_due_on ?? "Not set"} {c.commission_due_on && c.commission_due_on < today && <Badge tone="danger">Overdue</Badge>}
                </td>
                <td>{tripLink(c.trip)}</td>
                <td>{c.supplierName} {c.booking_reference}</td>
                <td>{money(c.currency, c.commission)}</td>
                <td>{money(c.currency, c.received)}</td>
                <td>{money(c.currency, c.owed)}</td>
                <td>{[c.commission_claimed_on, c.commission_claim_reference].filter(Boolean).join(" · ") || "Not claimed yet"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(queue === "verify" || queue === "reconcile" || queue === "queries" || queue === "unlinked") && counts[queue] > 0 && (
        <table>
          <thead>
            <tr>
              <th>Date</th><th>What</th><th>From / to</th><th>Trip</th><th>Amount</th>
              {queue === "queries" && <th>Reason</th>}
              {queue === "unlinked" && <th>Not linked</th>}
            </tr>
          </thead>
          <tbody>
            {(queue === "verify" ? toVerify : queue === "reconcile" ? toReconcile : queue === "queries" ? queries : unlinked).map((i) => (
              <tr key={i.id}>
                <td>{i.date}</td>
                <td>
                  {i.what} {queue === "unlinked" && !i.payment && <Badge>{i.side === "supplier" ? "Supplier" : "Client"}</Badge>}
                  {queue === "unlinked" && i.kind === "received" && <Badge>Deposit</Badge>}
                </td>
                <td>{i.party}</td>
                <td>{tripLink(i.trip)}</td>
                <td>{money(i.currency, i.amount)}</td>
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
