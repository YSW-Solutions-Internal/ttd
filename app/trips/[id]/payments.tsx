import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/relations";
import type { Side } from "@/lib/invoicing";
import { PAYMENT_KIND_LABEL, PAYMENT_STATUS_LABEL, type PaymentKind, type PaymentStatus } from "@/lib/payments";
import type { Billable } from "./invoicing-data";
import { AddPaymentForm, DeletePaymentButton, PaymentLinkForm, PaymentStatusForms, RemovePaymentLinkButton, ReverseForm } from "./payment-forms";
import { Badge, Msg } from "@/app/ui";

const amount = (currency: string, n: number) => `${currency} ${n.toFixed(2)}`;
const round = (n: number) => Math.round(n * 100) / 100;

type Target = { id: string; label: string };

/**
 * The Trip's Payments, Supplier side and Client side, each with what it pays or settles
 * (GLOSSARY: Payment). `outstanding` is each Client invoice's (or credit note's) Rand not yet
 * settled; `refunds` and `commissions` are what each Supplier still has to send.
 */
export async function Payments({
  tripId,
  quoteId,
  clientId,
  billables,
  invoices,
  creditNotes,
  refunds,
  commissions,
  accounts,
}: {
  tripId: string;
  quoteId: string;
  clientId: string;
  billables: Billable[];
  invoices: { id: string; number: string; outstanding: number }[];
  creditNotes: { id: string; number: string; outstanding: number }[];
  refunds: { key: string; supplierId: string; label: string; left: number }[]; // key: "entityId|changeId"
  commissions: { key: string; supplierId: string; label: string; left: number }[]; // key: entityId
  accounts: boolean; // Accountants and Administrators
}) {
  const supabase = await createClient();
  const [{ data: payments }, { data: payAccounts }] = await Promise.all([
    supabase
      .from("payments")
      .select(
        "id, side, kind, supplier_id, paid_on, amount, currency, rand_amount, status, query_reason, reverses_id, notes, suppliers(name), account:payment_accounts!payments_account_id_fkey(nickname), landed:payment_accounts!payments_landed_account_id_fkey(nickname), payment_links(id, entity_id, change_id, invoice_id, amount)",
      )
      .eq("trip_id", tripId)
      .order("paid_on")
      .order("created_at"),
    supabase.from("payment_accounts").select("id, client_id, kind, nickname").is("retired_at", null).or(`client_id.is.null,client_id.eq.${clientId}`).order("nickname"),
  ]);

  const byKey = new Map(billables.map((b) => [b.key, b]));
  const invoiceNo = new Map([...invoices, ...creditNotes].map((i) => [i.id, i.number]));
  const reversed = new Set((payments ?? []).flatMap((p) => (p.reverses_id ? [p.reverses_id] : [])));
  const agency = (payAccounts ?? []).filter((a) => !a.client_id);
  const clients = (payAccounts ?? []).filter((a) => a.client_id);
  const option = (a: { id: string; nickname: string; client_id: string | null; kind: string }) => ({
    id: a.id,
    label: a.client_id ? `Client's ${a.nickname}` : a.nickname,
    lands: !!a.client_id && a.kind !== "card",
  });
  const landing = agency.filter((a) => a.kind !== "card").map(option);
  const suppliers = [...new Map(billables.map((b) => [b.supplierId, { id: b.supplierId, label: b.supplierName }])).values()];

  const block = (side: Side) =>
    (payments ?? [])
      .filter((p) => p.side === side)
      .map((p) => {
        const total = Number(p.amount);
        const links = p.payment_links ?? [];
        const unlinked = round(total - links.reduce((a, l) => a + Number(l.amount), 0));
        const locked = !!p.reverses_id || reversed.has(p.id); // a reversal and what it reverses keep their links
        const linked = new Set(links.map((l) => l.invoice_id ?? (l.change_id ? `${l.entity_id}|${l.change_id}` : l.entity_id)));
        const kind = p.kind as PaymentKind;
        const targets: Target[] = {
          paid: () => billables.filter((b) => b.supplierId === p.supplier_id && !linked.has(b.key)).map((b) => ({ id: b.key, label: b.label })),
          refund_in: () =>
            refunds.filter((r) => r.supplierId === p.supplier_id && r.left > 0 && !linked.has(r.key)).map((r) => ({ id: r.key, label: `${r.label} (R ${r.left.toFixed(2)} still to come)` })),
          commission_in: () =>
            commissions.filter((c) => c.supplierId === p.supplier_id && c.left > 0 && !linked.has(c.key)).map((c) => ({ id: c.key, label: `${c.label} (${c.left.toFixed(2)} owed)` })),
          received: () => invoices.filter((i) => i.outstanding > 0 && !linked.has(i.id)).map((i) => ({ id: i.id, label: `Invoice ${i.number} (R ${i.outstanding.toFixed(2)} outstanding)` })),
          refund_out: () =>
            creditNotes.filter((i) => i.outstanding > 0 && !linked.has(i.id)).map((i) => ({ id: i.id, label: `Credit note ${i.number} (R ${i.outstanding.toFixed(2)} to pay back)` })),
        }[kind]();
        const status = p.status as PaymentStatus;
        return (
          <section key={p.id} className="mb-3 rounded-md border border-line bg-white p-4">
            <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <b>
                {p.reverses_id ? "Reversal: " : ""}
                {PAYMENT_KIND_LABEL[kind]}
                {side === "supplier" && ` · ${one(p.suppliers)?.name ?? ""}`}
              </b>
              <span className="text-muted tabular-nums">{p.paid_on}</span>
              <span className="font-semibold tabular-nums">
                {amount(p.currency, total)}
                {p.currency !== "ZAR" && ` = R ${Number(p.rand_amount).toFixed(2)}`}
              </span>
              <span>
                {one(p.account)?.nickname}
                {one(p.landed) && ` into ${one(p.landed)?.nickname}`}
              </span>
              <Badge tone={status === "reconciled" ? "teal" : status === "query" ? "danger" : "neutral"}>{PAYMENT_STATUS_LABEL[status]}</Badge>
              {reversed.has(p.id) && <Badge tone="danger">Reversed</Badge>}
            </div>
            {p.notes && <p className="mb-3 text-[13px] text-muted">{p.notes}</p>}
            {status === "query" && (
              <Msg tone="error" className="mb-3">
                Query: {p.query_reason}
              </Msg>
            )}
            {links.length > 0 && (
              <table>
                <tbody>
                  {links.map((l) => (
                    <tr key={l.id}>
                      <td>
                        {l.invoice_id
                          ? `${kind === "refund_out" ? "Credit note" : "Client invoice"} ${invoiceNo.get(l.invoice_id) ?? ""}`
                          : (byKey.get(l.change_id ? `${l.entity_id}|${l.change_id}` : l.entity_id)?.label ?? "An Item no longer on the Quote")}
                      </td>
                      <td className="text-right">{amount(p.currency, Number(l.amount))}</td>
                      <td className="w-24 text-right">{!locked && <RemovePaymentLinkButton linkId={l.id} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {unlinked !== 0 && !locked && (
              <Msg tone="warn" className="mt-3">
                {amount(p.currency, unlinked)}{" "}
                {kind === "received" ? "not yet linked to a Client invoice (a deposit)." : kind === "refund_out" ? "not yet linked to a credit note." : "not linked to anything yet."}
              </Msg>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 empty:hidden">
              {!locked && unlinked > 0 && <PaymentLinkForm paymentId={p.id} quoteId={quoteId} side={side} targets={targets} remaining={unlinked} />}
              {accounts && <PaymentStatusForms paymentId={p.id} status={status} />}
              {!p.reverses_id && !reversed.has(p.id) && status !== "unreconciled" && <ReverseForm paymentId={p.id} />}
              {status === "unreconciled" && !reversed.has(p.id) && <DeletePaymentButton paymentId={p.id} />}
            </div>
          </section>
        );
      });

  return (
    <>
      <h2>Payments</h2>
      <h3>To Suppliers</h3>
      {block("supplier")}
      <AddPaymentForm tripId={tripId} side="supplier" suppliers={suppliers} accounts={[...agency, ...clients.filter((a) => a.kind === "card")].map(option)} landing={landing} />
      <h3>From the Client</h3>
      {block("client")}
      <AddPaymentForm tripId={tripId} side="client" suppliers={[]} accounts={clients.map(option)} landing={landing} />
    </>
  );
}
