// Payments and Payment accounts (GLOSSARY, ADR 0013).
// No path aliases, so this file also runs under plain `node` for payments.test.ts.
import { FieldParseError, parseAmount } from "./form-values.ts";
import { currencyAndRate } from "./booking.ts";
import type { Side } from "./invoicing.ts";

export type PaymentStatus = "unreconciled" | "reconciled" | "query";

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = { unreconciled: "Unreconciled", reconciled: "Reconciled", query: "Query" };

export const ACCOUNT_KIND_LABEL: Record<string, string> = { bank: "Bank account", eft: "EFT", card: "Card", cash: "Cash" };

export type PaymentValues = {
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
