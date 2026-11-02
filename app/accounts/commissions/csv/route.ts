import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { csvLine } from "@/lib/payments";
import { loadCommissionQueue } from "../../refunds-data";

/** The Commissions owed as CSV: Accountants and Administrators. */
export async function GET() {
  const me = await getProfile();
  if (!me || (me.role !== "admin" && me.role !== "accountant")) return new NextResponse("Not allowed", { status: 403 });
  const rows = await loadCommissionQueue();
  const lines = [
    csvLine(["Trip", "Booking", "Supplier", "Currency", "Commission", "Received", "Owed", "Claimed", "Claim reference", "Due"]),
    ...rows.map((c) =>
      csvLine([
        c.trip.reference,
        c.booking_reference,
        c.supplierName,
        c.currency,
        c.commission.toFixed(2),
        c.received.toFixed(2),
        c.owed.toFixed(2),
        c.commission_claimed_on,
        c.commission_claim_reference,
        c.commission_due_on,
      ]),
    ),
  ];
  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="Commissions owed.csv"' },
  });
}
