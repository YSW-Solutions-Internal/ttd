import { createClient } from "@/lib/supabase/server";
import { everyRow, one } from "@/lib/relations";
import { moneyIn, PAYMENT_KIND_LABEL, statementMonth, type PaymentKind } from "@/lib/payments";

/** One statement account's Payments in one month, across all Trips (ADR 0013). Null if there is no such account. */
export async function loadStatement(accountId: string, rawMonth: string | undefined) {
  const supabase = await createClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
  const { month, from, to } = statementMonth(rawMonth, today);
  const { data: account } = await supabase.from("payment_accounts").select("id, nickname, kind, clients(full_name)").eq("id", accountId).maybeSingle();
  if (!account) return null;
  const rows = await everyRow((a, b) =>
    supabase
      .from("payments")
      .select("id, side, kind, paid_on, amount, currency, rate, rand_amount, status, query_reason, reverses_id, suppliers(name), trips(id, reference, clients(full_name))")
      .eq("statement_account_id", accountId)
      .gte("paid_on", from)
      .lt("paid_on", to)
      .order("paid_on")
      .order("created_at")
      .order("id")
      .range(a, b),
  );
  const payments = rows.map((p) => ({
    ...p,
    trip: one(p.trips),
    party: p.side === "supplier" ? one(p.suppliers)?.name ?? "" : one(one(p.trips)?.clients)?.full_name ?? "",
    kind: `${p.reverses_id ? "Reversal: " : ""}${PAYMENT_KIND_LABEL[p.kind as PaymentKind]}`,
    // Money in is positive, as on a statement.
    signed: (moneyIn(p.kind as PaymentKind) ? 1 : -1) * Number(p.rand_amount),
  }));
  return { account: { ...account, owner: one(account.clients)?.full_name ?? null }, month, payments };
}
