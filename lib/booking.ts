// Booking an Item, its Changes and Cancellations (GLOSSARY: Booked, Change, Cancellation).
// No path aliases, so this file also runs under plain `node` for booking.test.ts.
import { FieldParseError, parseAmount } from "./form-values.ts";

export type BookingValues = {
  supplier: string;
  booking_reference: string;
  currency: string;
  amount: number;
  rate: number;
  expected_invoice_on: string;
  ticket_numbers: string[];
  notes: string | null;
};

export type ChangeValues = {
  kind: "change" | "cancellation";
  happened_on: string;
  description: string | null;
  currency: string;
  rate: number;
  extra_fare: number;
  extra_taxes: number;
  supplier_penalty: number;
  agency_fee: number;
  markup: number;
  expected_refund: number | null;
  expected_invoice_on: string | null;
};

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();

function required(fd: FormData, name: string, label: string): string {
  const s = text(fd, name);
  if (!s) throw new FieldParseError(`${label} is required.`, name);
  return s;
}

function amount(fd: FormData, name: string, label: string, need = false): number {
  try {
    const n = parseAmount(text(fd, name), label);
    if (n === null && need) throw new Error(`${label} is required.`);
    return n ?? 0;
  } catch (e) {
    throw new FieldParseError((e as Error).message, name);
  }
}

function date(fd: FormData, name: string, label: string, need: boolean): string | null {
  const s = text(fd, name);
  if (!s) {
    if (need) throw new FieldParseError(`${label} is required.`, name);
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new FieldParseError(`${label} must be a date.`, name);
  return s;
}

/** Currency and rate; Rand is always at rate 1, whatever was typed. */
function currencyAndRate(fd: FormData): { currency: string; rate: number } {
  const currency = (text(fd, "currency") || "ZAR").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new FieldParseError("Currency must be a three-letter code such as USD.", "currency");
  if (currency === "ZAR") return { currency, rate: 1 };
  const rate = Number(text(fd, "rate").replace(",", "."));
  if (!Number.isFinite(rate) || rate <= 0) throw new FieldParseError("Rate to Rand is required and must be above 0.", "rate");
  return { currency, rate };
}

/** Ticket numbers, one per line or separated by commas. */
export function ticketNumbers(raw: string): string[] {
  return raw.split(/[\n,]+/).map((t) => t.trim()).filter(Boolean);
}

/** The booking form. Throws a FieldParseError naming the field at fault. */
export function parseBooking(fd: FormData): BookingValues {
  const amt = amount(fd, "amount", "Supplier amount", true);
  if (amt < 0) throw new FieldParseError("Supplier amount cannot be negative.", "amount");
  return {
    supplier: required(fd, "supplier", "Supplier"),
    booking_reference: required(fd, "booking_reference", "Booking reference"),
    ...currencyAndRate(fd),
    amount: amt,
    expected_invoice_on: date(fd, "expected_invoice_on", "Supplier invoice expected", true)!,
    ticket_numbers: ticketNumbers(text(fd, "ticket_numbers")),
    notes: text(fd, "notes") || null,
  };
}

/** The Change or Cancellation form. A Cancellation has no extra fare, taxes or Markup. */
export function parseChange(fd: FormData, kind: "change" | "cancellation"): ChangeValues {
  const cancel = kind === "cancellation";
  const v: ChangeValues = {
    kind,
    happened_on: date(fd, "happened_on", "Date", true)!,
    description: text(fd, "description") || null,
    ...currencyAndRate(fd),
    extra_fare: cancel ? 0 : amount(fd, "extra_fare", "Extra fare"),
    extra_taxes: cancel ? 0 : amount(fd, "extra_taxes", "Extra taxes"),
    supplier_penalty: amount(fd, "supplier_penalty", "Supplier penalty"),
    agency_fee: amount(fd, "agency_fee", cancel ? "Agency fee" : "Change fee"),
    markup: cancel ? 0 : amount(fd, "markup", "Markup"),
    expected_refund: cancel ? amount(fd, "expected_refund", "Refund expected") : null,
    expected_invoice_on: null,
  };
  if (v.expected_refund !== null && v.expected_refund < 0) throw new FieldParseError("Refund expected cannot be negative.", "expected_refund");
  v.expected_invoice_on = date(fd, "expected_invoice_on", "Supplier invoice expected", supplierCharges(v) !== 0);
  return v;
}

/** The Supplier's charges on a Change, in its own currency. */
export const supplierCharges = (c: Pick<ChangeValues, "extra_fare" | "extra_taxes" | "supplier_penalty">) =>
  Number(c.extra_fare) + Number(c.extra_taxes) + Number(c.supplier_penalty);

/** What a Change or Cancellation costs the Client, in Rand: Supplier charges at its rate, plus the agency fee and Markup. */
export function changeTotal(c: Pick<ChangeValues, "extra_fare" | "extra_taxes" | "supplier_penalty" | "rate" | "agency_fee" | "markup">): number {
  return Math.round((supplierCharges(c) * Number(c.rate) + Number(c.agency_fee) + Number(c.markup)) * 100) / 100;
}

/** A Cancellation's agency fee: the Transaction fee before issue, the Refund fee after. */
export function cancellationFee(item: { transaction_fee?: unknown; refund_fee?: unknown }, issued: boolean): number {
  return Number((issued ? item.refund_fee : item.transaction_fee) ?? 0) || 0;
}
