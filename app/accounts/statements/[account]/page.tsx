import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProfile, isAccounts } from "@/lib/auth";
import { PAYMENT_STATUS_LABEL, type PaymentStatus } from "@/lib/payments";
import { PaymentStatusForms } from "@/app/trips/[id]/payment-forms";
import { loadStatement } from "./data";
import { Badge, BUTTON } from "@/app/ui";
import { shiftMonth } from "@/lib/dates";

export const dynamic = "force-dynamic";

const rand = (n: number) => `R ${n.toFixed(2)}`;

/** One account's month, to tick off against its statement: Accountants and Administrators. */
export default async function StatementPage({ params, searchParams }: { params: Promise<{ account: string }>; searchParams: Promise<{ month?: string }> }) {
  const me = await getProfile();
  if (!me) redirect("/login");
  if (!isAccounts(me.role)) redirect("/");
  const s = await loadStatement((await params).account, (await searchParams).month);
  if (!s) notFound();
  const { account, month, payments } = s;
  const inflow = payments.filter((p) => p.signed > 0).reduce((a, p) => a + p.signed, 0);
  const outflow = payments.filter((p) => p.signed < 0).reduce((a, p) => a - p.signed, 0);
  const base = `/accounts/statements/${account.id}`;

  return (
    <main className="mx-auto my-8 max-w-[1200px] px-5">
      <p className="mb-3">
        <Link href="/accounts">Accounts</Link>
      </p>
      <h1>
        {account.owner ? `${account.owner}: ` : ""}
        {account.nickname}, {month}
      </h1>
      <p className="mb-4 flex flex-wrap items-center gap-4">
        <Link href={`${base}?month=${shiftMonth(month, -1)}`}>Previous month</Link>
        <Link href={`${base}?month=${shiftMonth(month, 1)}`}>Next month</Link>
        <a className={BUTTON.primary} href={`${base}/csv?month=${month}`} download>
          Download CSV
        </a>
      </p>
      <p className="mb-4 tabular-nums">
        In {rand(inflow)} · Out {rand(outflow)} · Net {rand(inflow - outflow)}
      </p>
      {payments.length === 0 && <p className="py-3 text-muted">No Payments this month.</p>}
      {payments.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Date</th><th>What</th><th>From / to</th><th>Trip</th><th className="text-right">Amount</th><th className="text-right">Rand</th><th>Status</th><th />
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{p.paid_on}</td>
                <td>{p.kind}</td>
                <td>{p.party}</td>
                <td>{p.trip && <Link href={`/trips/${p.trip.id}#accounts`}>{p.trip.reference}</Link>}</td>
                <td className="text-right tabular-nums">
                  {p.currency} {Number(p.amount).toFixed(2)}
                </td>
                <td className="text-right tabular-nums">{rand(p.signed)}</td>
                <td>
                  <Badge tone={p.status === "reconciled" ? "teal" : p.status === "query" ? "danger" : "neutral"}>{PAYMENT_STATUS_LABEL[p.status as PaymentStatus]}</Badge>
                  {p.status === "query" && <small className="block text-danger">{p.query_reason}</small>}
                </td>
                <td>
                  <div className="flex flex-wrap items-center gap-2">
                    <PaymentStatusForms paymentId={p.id} status={p.status as PaymentStatus} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
