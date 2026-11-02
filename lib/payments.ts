// Payments and Payment accounts (GLOSSARY, ADR 0013).
// No path aliases, so this file also runs under plain `node` for payments.test.ts.
import { FieldParseError, parseAmount } from "./form-values.ts";
import { currencyAndRate } from "./booking.ts";
import type { Side } from "./invoicing.ts";

export type PaymentStatus = "unreconciled" | "reconciled" | "query";

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = { unreconciled: "Unreconciled", reconciled: "Reconciled", query: "Query" };

export type PaymentKind = "paid" | "received" | "refund_in" | "refund_out" | "commission_in";

export const PAYMENT_KIND_LABEL: Record<PaymentKind, string> = {
  paid: "Paid to Supplier",
  received: "Received from Client",
  refund_in: "Refund from Supplier",
  refund_out: "Refund to Client",
  commission_in: "Commission from Supplier",
};

/** The kinds each side can record; the first is the default. */
export const KINDS: Record<Side, PaymentKind[]> = { supplier: ["paid", "refund_in", "commission_in"], client: ["received", "refund_out"] };

/** Money into the agency, positive on a statement. */
export const moneyIn = (kind: PaymentKind) => kind === "received" || kind === "refund_in" || kind === "commission_in";

export const ACCOUNT_KIND_LABEL: Record<string, string> = { bank: "Bank account", eft: "EFT", card: "Card", cash: "Cash" };

export type PaymentValues = {
  kind: PaymentKind;
  paid_on: string;
  amount: number;
  currency: string;
  rate: number;
  account_id: string;
  landed_account_id: string | null;
  supplier_id: string | null;
  notes: string | null;
};

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();

/** The add-payment form. Client Payments are in Rand; the database checks the accounts fit (migration 0027). */
export function parsePayment(fd: FormData, side: Side): PaymentValues {
  const kind = (text(fd, "kind") || KINDS[side][0]) as PaymentKind;
  if (!KINDS[side].includes(kind)) throw new FieldParseError("Choose what kind of Payment this is.", "kind");
  const paid_on = text(fd, "paid_on");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paid_on)) throw new FieldParseError("Date is required.", "paid_on");
  let amount: number | null;
  try {
    amount = parseAmount(text(fd, "amount"), "Amount");
  } catch (e) {
    throw new FieldParseError((e as Error).message, "amount");
  }
  if (!amount || amount <= 0) throw new FieldParseError("Amount is required and must be above 0.", "amount");
  const account_id = text(fd, "account_id");
  if (!account_id) throw new FieldParseError("Choose the Payment account.", "account_id");
  const supplier_id = side === "supplier" ? text(fd, "supplier_id") : null;
  if (side === "supplier" && !supplier_id) throw new FieldParseError("Choose the Supplier.", "supplier_id");
  return {
    kind,
    paid_on,
    amount,
    ...(side === "client" ? { currency: "ZAR", rate: 1 } : currencyAndRate(fd)),
    account_id,
    landed_account_id: text(fd, "landed_account_id") || null,
    supplier_id,
    notes: text(fd, "notes") || null,
  };
}

/** A calendar month as typed in the URL ("2026-10"), or the current one in South Africa. */
export function statementMonth(raw: string | undefined, today: string): { month: string; from: string; to: string } {
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw ?? "") ? raw! : today.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { month, from: `${month}-01`, to: `${next}-01` }; // to is exclusive
}

/** One CSV line: every value quoted, quotes doubled. */
export const csvLine = (values: (string | number | null)[]) => values.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",");
