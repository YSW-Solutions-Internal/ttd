import { NextResponse, type NextRequest } from "next/server";
import { getProfile } from "@/lib/auth";
import { csvLine, PAYMENT_STATUS_LABEL, type PaymentStatus } from "@/lib/payments";
import { loadStatement } from "../data";

/** The month-end CSV for one statement account: Accountants and Administrators. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ account: string }> }) {
  const me = await getProfile();
  if (!me || (me.role !== "admin" && me.role !== "accountant")) return new NextResponse("Not allowed", { status: 403 });
  const s = await loadStatement((await params).account, request.nextUrl.searchParams.get("month") ?? undefined);
  if (!s) return new NextResponse("Not found", { status: 404 });

  const lines = [
    csvLine(["Date", "Trip", "From / to", "What", "Amount", "Currency", "Rate", "Rand (in +, out -)", "Status"]),
    ...s.payments.map((p) =>
      csvLine([p.paid_on, p.trip?.reference ?? "", p.party, p.kind, Number(p.amount).toFixed(2), p.currency, Number(p.rate), p.signed.toFixed(2), PAYMENT_STATUS_LABEL[p.status as PaymentStatus]]),
    ),
  ];
  const name = `${s.account.owner ? `${s.account.owner} ` : ""}${s.account.nickname} ${s.month}`.replace(/[^\w .-]/g, "");
  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` },
  });
}
