import { createClient } from "@/lib/supabase/server";
import { everyRow } from "@/lib/relations";
import { commissionOwed, refundState, type RefundStatus } from "@/lib/refunds";

// The Refunds and Commissions owed queues (GLOSSARY: Accounts queues), shared by /accounts and its CSV exports.

type Trip = { id: string; reference: string; title: string | null };

/** Trips and Suppliers by id: PostgREST can't embed them through a view. */
// shortcut: one .in() of open items' ids; split it into chunks if open Refunds ever number in the hundreds.
async function names(tripIds: string[], supplierIds: string[]) {
  const supabase = await createClient();
  const [{ data: trips }, { data: suppliers }] = await Promise.all([
    supabase.from("trips").select("id, reference, title").in("id", [...new Set(tripIds)]),
    supabase.from("suppliers").select("id, name").in("id", [...new Set(supplierIds)]),
  ]);
  return {
    trip: (id: string): Trip => trips?.find((t) => t.id === id) ?? { id, reference: "", title: null },
    supplier: (id: string) => suppliers?.find((s) => s.id === id)?.name ?? "",
  };
}

/** Open Refunds, out of pocket first, then oldest requested. */
export async function loadRefundQueue() {
  const supabase = await createClient();
  const rows = await everyRow((from, to) => supabase.from("refund_totals").select("*").order("change_id").range(from, to));
  const open = rows
    .map((r) => {
      const status = (r.refund_status ?? "requested") as RefundStatus;
      const money = { approved: Number(r.approved), agency_fee: Number(r.agency_fee), received: Number(r.received), paid_back: Number(r.paid_back) };
      return { ...r, ...money, status, since: String(r.refund_requested_on ?? r.happened_on), ...refundState({ refund_status: status, issued: r.issued === true, ...money }) };
    })
    .filter((r) => r.open)
    .sort((a, b) => Number(b.outOfPocket) - Number(a.outOfPocket) || a.since.localeCompare(b.since));
  const n = await names(
    open.map((r) => r.trip_id),
    open.map((r) => r.supplier_id),
  );
  return open.map((r) => ({ ...r, trip: n.trip(r.trip_id), supplierName: n.supplier(r.supplier_id) }));
}

/** Claimed Commissions with something owed, soonest due first (overdue ones lead), undated last. */
export async function loadCommissionQueue() {
  const supabase = await createClient();
  const rows = await everyRow((from, to) => supabase.from("commission_totals").select("*").eq("commission_deducted", false).order("entity_id").range(from, to));
  const owed = rows
    .map((c) => ({ ...c, commission: Number(c.commission), received: Number(c.received), owed: commissionOwed({ commission: Number(c.commission), commission_deducted: false, received: Number(c.received) }) }))
    .filter((c) => c.owed > 0)
    .sort((a, b) => String(a.commission_due_on ?? "9999").localeCompare(String(b.commission_due_on ?? "9999")));
  const n = await names(
    owed.map((c) => c.trip_id),
    owed.map((c) => c.supplier_id),
  );
  return owed.map((c) => ({ ...c, trip: n.trip(c.trip_id), supplierName: n.supplier(c.supplier_id) }));
}
