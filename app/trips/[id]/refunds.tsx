import { commissionOwed, REFUND_STATUS_LABEL, refundState, type RefundStatus } from "@/lib/refunds";
import type { Billable } from "./invoicing-data";
import { CommissionForm, RefundForm } from "./refund-forms";
import { Badge } from "@/app/ui";

type Row = Record<string, unknown>;

const rand = (n: number) => `R ${n.toFixed(2)}`;
const num = (v: unknown) => Number(v ?? 0);
const str = (v: unknown) => (v == null ? "" : String(v));

/** The Trip's Refunds (one per Cancellation with a refund expected) and Commissions (GLOSSARY). Rows come from refund_totals and commission_totals. */
export function RefundsAndCommissions({ quoteId, billables, refunds, commissions }: { quoteId: string; billables: Billable[]; refunds: Row[]; commissions: Row[] }) {
  const label = (key: string) => billables.find((b) => b.key === key)?.label ?? "An Item no longer on the Quote";
  const booked = billables.filter((b) => b.changeId === null);
  const commissionOf = new Map(commissions.map((c) => [str(c.entity_id), c]));

  return (
    <>
      {refunds.length > 0 && <h2>Refunds</h2>}
      {refunds.map((r) => {
        const status = (r.refund_status ?? "requested") as RefundStatus;
        const s = refundState({ refund_status: status, issued: r.issued === true, approved: num(r.approved), agency_fee: num(r.agency_fee), received: num(r.received), paid_back: num(r.paid_back) });
        return (
          <section key={str(r.change_id)} className="mb-3 rounded-md border border-line bg-white p-4">
            <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <b>{label(`${str(r.entity_id)}|${str(r.change_id)}`)}</b>
              <Badge tone={status === "declined" ? "danger" : status === "approved" ? "teal" : "neutral"}>{REFUND_STATUS_LABEL[status]}</Badge>
              <Badge tone={s.open ? "amber" : "neutral"}>{s.open ? "Open" : "Closed"}</Badge>
              {s.outOfPocket && <Badge tone="danger">Out of pocket</Badge>}
            </div>
            <p className="tabular-nums text-[13px]">
              Expected {rand(num(r.expected_refund))} · Approved {rand(num(r.approved))} · Received {rand(num(r.received))} · Fee {rand(num(r.agency_fee))} ·{" "}
              {r.issued ? (
                <>
                  Due back to the Client {rand(s.dueBack)} · Paid back {rand(num(r.paid_back))}
                </>
              ) : (
                "Cancelled before issue: the Client gets their money back on a credit note for the Item"
              )}
            </p>
            <RefundForm
              // Remount after a save: a reset form would otherwise show (and resend) the values it opened with.
              key={[status, str(r.refund_requested_on), str(r.refund_reference), str(r.refund_approved)].join("|")}
              changeId={str(r.change_id)}
              status={status}
              requestedOn={str(r.refund_requested_on)}
              reference={str(r.refund_reference)}
              approved={r.refund_approved == null ? "" : num(r.refund_approved).toFixed(2)}
              expected={num(r.expected_refund).toFixed(2)}
            />
          </section>
        );
      })}

      {booked.length > 0 && <h2>Commissions</h2>}
      {booked.map((b) => {
        const c = commissionOf.get(b.entityId);
        const deducted = c?.commission_deducted === true;
        return (
          <section key={b.key} className="mb-3 rounded-md border border-line bg-white p-4">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <b>{b.label}</b>
              {!c && <span className="text-muted">None</span>}
              {c && (
                <span className="tabular-nums">
                  {b.currency} {num(c.commission).toFixed(2)}
                  {deducted
                    ? " deducted from the Supplier payment"
                    : ` claimed · received ${num(c.received).toFixed(2)} · owed ${commissionOwed({ commission: num(c.commission), commission_deducted: false, received: num(c.received) }).toFixed(2)}`}
                  {!deducted && c.commission_due_on ? ` · due ${str(c.commission_due_on)}` : ""}
                </span>
              )}
            </div>
            {c?.commission_note ? <p className="text-[13px] text-muted">{str(c.commission_note)}</p> : null}
            <CommissionForm
              key={c ? JSON.stringify([c.commission, c.commission_note, deducted, c.commission_claimed_on, c.commission_claim_reference, c.commission_due_on]) : "none"}
              quoteId={quoteId}
              entityId={b.entityId}
              currency={b.currency}
              current={
                c
                  ? {
                      amount: num(c.commission).toFixed(2),
                      note: str(c.commission_note),
                      deducted,
                      claimedOn: str(c.commission_claimed_on),
                      reference: str(c.commission_claim_reference),
                      dueOn: str(c.commission_due_on),
                    }
                  : null
              }
            />
          </section>
        );
      })}
    </>
  );
}
