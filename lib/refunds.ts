// Refunds and Commissions (GLOSSARY, migration 0029).
// No path aliases, so this file also runs under plain `node` for refunds.test.ts.
import { FieldParseError, parseAmount } from "./form-values.ts";

export type RefundStatus = "requested" | "approved" | "declined";

export const REFUND_STATUS_LABEL: Record<RefundStatus, string> = { requested: "Requested", approved: "Approved", declined: "Declined" };

const round = (n: number) => Math.round(n * 100) / 100;
const reached = (n: number, target: number) => n >= target - 0.005;
const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();
const date = (fd: FormData, name: string) => (/^\d{4}-\d{2}-\d{2}$/.test(text(fd, name)) ? text(fd, name) : null);

/**
 * Where a Refund stands, all in Rand. Cancelled after issue, the Client gets back the approved
 * amount less the agency's fee (never below nothing); before issue, the Item's credit note gives
 * the Client their money back, so nothing is due back here. Open until the Supplier has refunded
 * and what is due back is paid back, or Declined.
 */
export function refundState(r: { refund_status: RefundStatus | null; issued: boolean; approved: number; agency_fee: number; received: number; paid_back: number }) {
  const dueBack = r.issued ? Math.max(0, round(r.approved - r.agency_fee)) : 0;
  const open = r.refund_status !== "declined" && !(reached(r.received, r.approved) && reached(r.paid_back, dueBack));
  return { open, outOfPocket: r.paid_back > r.received + 0.005, dueBack };
}

/** The Trips with an open Refund, from refund_totals rows (numbers may arrive as strings). */
export function openRefundTrips(rows: { trip_id: string; refund_status: string | null; issued: boolean; approved: unknown; agency_fee: unknown; received: unknown; paid_back: unknown }[]) {
  return new Set(
    rows
      .filter(
        (r) =>
          refundState({
            refund_status: r.refund_status as RefundStatus | null,
            issued: r.issued,
            approved: Number(r.approved),
            agency_fee: Number(r.agency_fee),
            received: Number(r.received),
            paid_back: Number(r.paid_back),
          }).open,
      )
      .map((r) => r.trip_id),
  );
}

/** What a Supplier still owes on a Commission, in its currency. A deducted one is settled by the Supplier Payment. */
export const commissionOwed = (c: { commission: number; commission_deducted: boolean; received: number }) =>
  c.commission_deducted ? 0 : round(c.commission - c.received);

function amount(fd: FormData, name: string, label: string): number | null {
  try {
    return parseAmount(text(fd, name), label);
  } catch (e) {
    throw new FieldParseError((e as Error).message, name);
  }
}

/** The Refund form: status, requested date, Supplier reference and the approved amount (blank: as expected). */
export function parseRefund(fd: FormData): { status: RefundStatus; requested_on: string | null; reference: string | null; approved: number | null } {
  const status = text(fd, "status") as RefundStatus;
  if (!(status in REFUND_STATUS_LABEL)) throw new FieldParseError("Choose where the Refund stands.", "status");
  const approved = amount(fd, "approved", "Approved amount");
  if (approved !== null && approved < 0) throw new FieldParseError("The approved amount cannot be negative.", "approved");
  return { status, requested_on: date(fd, "requested_on"), reference: text(fd, "reference") || null, approved };
}

/** The Commission form. A blank amount takes the Commission off; a deducted one has no claim. */
export function parseCommission(fd: FormData) {
  const value = amount(fd, "amount", "Commission");
  if (value !== null && value <= 0) throw new FieldParseError("A Commission is above 0; leave it blank to take it off.", "amount");
  const deducted = fd.get("deducted") === "on";
  return {
    amount: value,
    note: text(fd, "note") || null,
    deducted,
    claimed_on: deducted ? null : date(fd, "claimed_on"),
    reference: deducted ? null : text(fd, "reference") || null,
    due_on: deducted ? null : date(fd, "due_on"),
  };
}
