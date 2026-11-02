import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { one } from "@/lib/relations";
import { TABS } from "@/app/quotes/[id]/edit-section";
import { ITEM_LABEL } from "@/app/quotes/[id]/item-fields";
import { loadBillables } from "../invoicing-data";
import { Invoices } from "../invoices";
import { Payments } from "../payments";
import { RefundsAndCommissions } from "../refunds";
import { TripStatusBadge } from "@/app/ui";
import { commissionOwed } from "@/lib/refunds";

export const dynamic = "force-dynamic";

/** A Trip's money: what was booked, its invoices and its Payments (any User; Accountants work here). */
export default async function TripAccountsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const me = await getProfile();
  const { data: trip } = await supabase
    .from("trips")
    .select("id, reference, title, status, clients(id, full_name, client_code, consultant_id), quotes(id)")
    .eq("id", id)
    .maybeSingle();
  if (!trip) notFound();
  const client = one(trip.clients);
  const quote = one(trip.quotes);

  const [{ data: invoices }, { data: links }, { data: refunds }, { data: commissions }, ...tables] = await Promise.all([
    supabase.from("invoices").select("id, number, amount").eq("trip_id", id).eq("side", "client").order("issued_on"),
    supabase.from("payment_links").select("entity_id, change_id, invoice_id, amount, payments(kind)").eq("trip_id", id),
    supabase.from("refund_totals").select("*").eq("trip_id", id).order("happened_on"),
    supabase.from("commission_totals").select("*").eq("trip_id", id),
    ...TABS.map(([t]) => supabase.from(t).select("*").eq("quote_id", quote?.id ?? "")),
  ]);
  const items = new Map(
    TABS.flatMap(([t], i) =>
      (tables[i]?.data ?? []).map((row) => [String(row.entity_id), { row, label: [ITEM_LABEL[t], row.label ?? row.name].filter(Boolean).join(": ") }] as const),
    ),
  );
  const billables = quote ? await loadBillables(supabase, quote.id, items) : [];

  const sum = (key: (l: NonNullable<typeof links>[number]) => string | null) => {
    const m = new Map<string, number>();
    for (const l of links ?? []) {
      const k = key(l);
      if (k) m.set(k, Math.round(((m.get(k) ?? 0) + Number(l.amount)) * 100) / 100);
    }
    return m;
  };
  // Refunds and Commissions coming in are not payments to the Supplier.
  const paid = sum((l) => (one(l.payments)?.kind !== "paid" ? null : l.change_id ? `${l.entity_id}|${l.change_id}` : l.entity_id));
  const settled = sum((l) => l.invoice_id);
  const label = (key: string) => billables.find((b) => b.key === key)?.label ?? "An Item no longer on the Quote";

  const admin = me?.role === "admin";
  const accounts = admin || me?.role === "accountant";
  const canAddInvoice = admin || ["booked", "travelled", "cancelled"].includes(trip.status) || client?.consultant_id === me?.id;

  return (
    <main className="mx-auto my-8 max-w-[1200px] px-5">
      <p className="mb-3">
        <Link href={`/trips/${id}`}>Back to the Trip</Link>
      </p>
      <header className="mb-6 border-b border-line pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold text-muted tabular-nums">{trip.reference}</span>
          <TripStatusBadge status={trip.status} />
        </div>
        <h1 className="mt-1">Accounts: {trip.title ?? "Untitled trip"}</h1>
        <p className="text-muted">
          For <Link href={`/clients/${client?.id}`}>{client?.full_name} ({client?.client_code})</Link>.
        </p>
      </header>
      {quote && (
        <Invoices tripId={id} quoteId={quote.id} billables={billables} canAdd={canAddInvoice} accounts={accounts} admin={admin} paid={paid} settled={settled} />
      )}
      {quote && <RefundsAndCommissions quoteId={quote.id} billables={billables} refunds={refunds ?? []} commissions={commissions ?? []} />}
      {quote && client && (
        <Payments
          tripId={id}
          quoteId={quote.id}
          clientId={client.id}
          billables={billables}
          invoices={(invoices ?? []).filter((i) => Number(i.amount) > 0).map((i) => ({ id: i.id, number: i.number, outstanding: Math.round((Number(i.amount) - (settled.get(i.id) ?? 0)) * 100) / 100 }))}
          creditNotes={(invoices ?? []).filter((i) => Number(i.amount) < 0).map((i) => ({ id: i.id, number: i.number, outstanding: Math.round((-Number(i.amount) - (settled.get(i.id) ?? 0)) * 100) / 100 }))}
          refunds={(refunds ?? []).map((r) => ({
            key: `${r.entity_id}|${r.change_id}`,
            supplierId: r.supplier_id,
            label: label(`${r.entity_id}|${r.change_id}`),
            left: r.refund_status === "declined" ? 0 : Math.round((Number(r.approved) - Number(r.received)) * 100) / 100,
          }))}
          commissions={(commissions ?? []).map((c) => ({ key: c.entity_id, supplierId: c.supplier_id, label: label(c.entity_id), left: commissionOwed({ commission: Number(c.commission), commission_deducted: c.commission_deducted, received: Number(c.received) }) }))}
          accounts={accounts}
        />
      )}
    </main>
  );
}
