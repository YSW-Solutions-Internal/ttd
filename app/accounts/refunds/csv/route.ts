import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { csvLine } from "@/lib/payments";
import { REFUND_STATUS_LABEL, type RefundStatus } from "@/lib/refunds";
import { loadRefundQueue } from "../../refunds-data";

/** The open Refunds as CSV: Accountants and Administrators. */
export async function GET() {
  const me = await getProfile();
  if (!me || (me.role !== "admin" && me.role !== "accountant")) return new NextResponse("Not allowed", { status: 403 });
  const rows = await loadRefundQueue();
  const lines = [
    csvLine(["Trip", "Booking", "Supplier", "Status", "Requested", "Reference", "Approved (R)", "Received (R)", "Due back (R)", "Paid back (R)", "Out of pocket"]),
    ...rows.map((r) =>
      csvLine([
        r.trip.reference,
        r.booking_reference,
        r.supplierName,
        REFUND_STATUS_LABEL[r.status as RefundStatus],
        r.refund_requested_on,
        r.refund_reference,
        r.approved.toFixed(2),
        r.received.toFixed(2),
        r.dueBack.toFixed(2),
        r.paid_back.toFixed(2),
        r.outOfPocket ? "Yes" : "",
      ]),
    ),
  ];
  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="Refunds.csv"' },
  });
}
