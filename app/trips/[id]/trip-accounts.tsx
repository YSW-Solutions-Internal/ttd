import { createClient } from "@/lib/supabase/server";
import { getProfile, isAccounts } from "@/lib/auth";
import { one } from "@/lib/relations";
import { TABLE_KIND } from "@/lib/extraction/tables";
import { TABS } from "@/app/quotes/[id]/edit-section";
import { ITEM_LABEL } from "@/app/quotes/[id]/item-fields";
import { loadBillables } from "./invoicing-data";
import { Invoices } from "./invoices";
import { Payments } from "./payments";
import { RefundsAndCommissions } from "./refunds";
import { commissionOwed } from "@/lib/refunds";

/** The Trip's Accounts tab: what was booked, its invoices and its Payments (any User; Accountants work here). */
export async function TripAccounts({
  tripId,
  status,
  quoteId,
  client,
}: {
  tripId: string;
  status: string;
  quoteId: string | null;
  client: { id: string; consultant_id: string | null } | null;
}) {
  if (!quoteId) return <p className="py-3 text-muted">This Trip has no Quote yet.</p>;
  const supabase = await createClient();
  const me = await getProfile();

  const [{ data: invoices }, { data: links }, { data: refunds }, { data: commissions }, ...tables] = await Promise.all([
    supabase.from("invoices").select("id, number, amount").eq("trip_id", tripId).eq("side", "client").order("issued_on"),
    supabase.from("payment_links").select("entity_id, change_id, invoice_id, amount, payments(kind)").eq("trip_id", tripId),
    supabase.from("refund_totals").select("*").eq("trip_id", tripId).order("happened_on"),
    supabase.from("commission_totals").select("*").eq("trip_id", tripId),
    ...TABS.map(([t]) => supabase.from(t).select("*").eq("quote_id", quoteId)),
  ]);
  const items = new Map(
    TABS.flatMap(([t], i) =>
      (tables[i]?.data ?? []).map((row) => [String(row.entity_id), { row, kind: TABLE_KIND[t], label: [ITEM_LABEL[t], row.label ?? row.name].filter(Boolean).join(": ") }] as const),
    ),
  );
  const billables = await loadBillables(supabase, quoteId, items);

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
  const accounts = !!me && isAccounts(me.role);
  const canAddInvoice = admin || ["booked", "travelled", "cancelled"].includes(status) || client?.consultant_id === me?.id;

  return (
    // id: links to /trips/[id]#accounts open this tab (trip-tabs.tsx).
    <div id="accounts" className="scroll-mt-4">
      <Invoices tripId={tripId} quoteId={quoteId} billables={billables} canAdd={canAddInvoice} accounts={accounts} admin={admin} paid={paid} settled={settled} />
      <RefundsAndCommissions quoteId={quoteId} billables={billables} refunds={refunds ?? []} commissions={commissions ?? []} />
      {client && (
        <Payments
          tripId={tripId}
          quoteId={quoteId}
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
          commissions={(commissions ?? []).map((c) => ({ key: c.entity_id, supplierId: c.supplier_id, currency: c.currency, label: label(c.entity_id), left: commissionOwed({ commission: Number(c.commission), commission_deducted: c.commission_deducted, received: Number(c.received) }) }))}
          accounts={accounts}
        />
      )}
    </div>
  );
}
