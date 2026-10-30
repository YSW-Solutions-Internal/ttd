// Supplier invoices, Client invoices and the Invoicing stage (GLOSSARY, ADR 0012).
// No path aliases, so this file also runs under plain `node` for invoicing.test.ts.
import { FieldParseError, parseAmount } from "./form-values.ts";
import { changeTotal, supplierCharges, type ChangeValues } from "./booking.ts";

export type Side = "supplier" | "client";
export type InvoiceStatus = "received" | "verified" | "query";
export type Stage = "awaiting" | "received" | "verified" | "invoiced" | "none_expected";

export const STAGE_LABEL: Record<Stage, string> = {
  awaiting: "Awaiting supplier invoice",
  received: "Received",
  verified: "Verified",
  invoiced: "Invoiced",
  none_expected: "No supplier invoice expected",
};

export const STATUS_LABEL: Record<InvoiceStatus, string> = { received: "Received", verified: "Verified", query: "Query" };

export type InvoiceValues = { number: string; issued_on: string; amount: number; currency: string };

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();
const round = (n: number) => Math.round(n * 100) / 100;

/** The add-invoice form. A credit note is the same record with a negative amount; Client invoices are in Rand. */
export function parseInvoice(fd: FormData, side: Side): InvoiceValues {
  const number = text(fd, "number");
  if (!number) throw new FieldParseError("Invoice number is required.", "number");
  const issued_on = text(fd, "issued_on");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issued_on)) throw new FieldParseError("Invoice date is required.", "issued_on");
  let amount: number | null;
  try {
    amount = parseAmount(text(fd, "amount"), "Amount");
  } catch (e) {
    throw new FieldParseError((e as Error).message, "amount");
  }
  if (!amount) throw new FieldParseError("Amount is required and cannot be 0.", "amount");
  const currency = side === "client" ? "ZAR" : (text(fd, "currency") || "ZAR").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new FieldParseError("Currency must be a three-letter code such as USD.", "currency");
  // Typed as a positive number; the box says which it is.
  const credit = fd.get("credit_note") === "on";
  return { number, issued_on, amount: credit ? -Math.abs(amount) : Math.abs(amount), currency };
}

/** A link's amount: may be negative only on a credit note. */
export function parseLinkAmount(raw: string, credit: boolean): number {
  let n: number | null;
  try {
    n = parseAmount(raw.trim(), "Amount");
  } catch (e) {
    throw new FieldParseError((e as Error).message, "amount");
  }
  if (!n) throw new FieldParseError("Amount is required and cannot be 0.", "amount");
  return credit ? -Math.abs(n) : Math.abs(n);
}

type ChangeRow = Pick<ChangeValues, "kind" | "extra_fare" | "extra_taxes" | "supplier_penalty" | "rate" | "agency_fee" | "markup" | "expected_refund">;

/**
 * What a Change costs the Client in Rand. A Cancellation with a refund expected is not
 * invoiced: its fee comes off the Refund instead.
 */
export function changeCharge(c: ChangeRow): number {
  if (c.kind === "cancellation" && Number(c.expected_refund) > 0) return 0;
  return changeTotal(c);
}

/** A Change with no Supplier charges expects no Supplier invoice. */
export const expectsSupplierInvoice = (c: ChangeRow) => supplierCharges(c) !== 0;

/**
 * Where an Item or Change stands, and the Rand amount still to invoice.
 * Invoiced once nothing is left to invoice, even while the Supplier invoice is awaited;
 * one in Query counts as Received.
 */
export function invoicingStage(t: {
  charge: number; // what the Client pays for it, in Rand
  clientInvoiced: number[]; // amounts linked to it on Client invoices (credit notes negative)
  supplierStatuses: InvoiceStatus[]; // its linked Supplier invoices
  noneExpected: boolean;
}): { stage: Stage; toInvoice: number } {
  const toInvoice = round(t.charge - t.clientInvoiced.reduce((a, b) => a + b, 0));
  let stage: Stage;
  if (t.clientInvoiced.length > 0 && toInvoice <= 0) stage = "invoiced";
  else if (t.noneExpected) stage = "none_expected";
  else if (t.supplierStatuses.length > 0 && t.supplierStatuses.every((s) => s === "verified")) stage = "verified";
  else if (t.supplierStatuses.length > 0) stage = "received";
  else stage = "awaiting";
  return { stage, toInvoice };
}

/** An Item's own charge: nothing once it is cancelled before issue, when the Client pays only the Cancellation. */
export const itemCharge = (total: number, b: { issued: boolean; cancelled: boolean }) => (b.cancelled && !b.issued ? 0 : total);

/**
 * The Awaiting queue: expects a Supplier invoice and has none linked, whatever its Client
 * side, soonest expected first, so overdue ones lead.
 */
export function awaitingQueue<T extends { expectsInvoice: boolean; links: { side: Side }[]; expectedOn: string | null }>(rows: T[]): T[] {
  return rows
    .filter((r) => r.expectsInvoice && !r.links.some((l) => l.side === "supplier"))
    .sort((a, b) => (a.expectedOn ?? "9999").localeCompare(b.expectedOn ?? "9999"));
}
