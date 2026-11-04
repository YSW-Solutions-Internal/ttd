// Item totals and money formatting for the quote PDF (GLOSSARY: Item total, Transaction fee, Markup, Pre-payment fee).
import type { Amount, Priced, QuoteJson } from "./types";

/** A number from JSON; null, empty or non-numeric text gives the fallback. */
export function num(value: Amount | unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const s = String(value).replaceAll(" ", "");
  const n = Number(s);
  return s !== "" && Number.isFinite(n) ? n : fallback;
}

/** "R 12 345.67": every price is in Rand, space as the thousands separator, two decimals. */
export function money(amount: Amount): string {
  const [whole, cents] = Math.abs(num(amount)).toFixed(2).split(".");
  const sign = num(amount) < 0 && Number(`${whole}.${cents}`) !== 0 ? "-" : "";
  return `R ${sign}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${cents}`;
}

/** Fee units: rooms for Accommodation, people for a Conference Extra, else 1 (never below 1). */
export function feeUnits(kind: string, row: Record<string, unknown>): number {
  const n = kind === "hotel" ? row.rooms : kind === "extra" && row.extra_type === "conference" ? row.people : 1;
  return Math.max(1, Math.trunc(num(n, 1)));
}

/** The Item total before any Card surcharge; null when the price is missing. */
function baseTotal(item: Priced, units: number): number | null {
  if (item.price === null || item.price === undefined || item.price === "") return null;
  return (
    num(item.price) +
    num(item.transaction_fee) * Math.max(1, Math.trunc(num(units, 1))) +
    num(item.markup) +
    (item.prepaid ? num(item.prepayment_fee) : 0)
  );
}

/**
 * The Item total: price + Transaction fee (per room, or per person for a Conference)
 * + Markup, + Pre-payment fee when prepaid, + Card surcharge when card paid.
 * Refund and Change fees are shown, never added.
 * Null when the price is missing, which can only mean "On request".
 */
export function itemTotal(item: Priced, units = 1): number | null {
  const base = baseTotal(item, units);
  return base === null ? null : base + (item.card_paid ? num(item.card_surcharge) : 0);
}

/** The Card surcharge: rate x the Item total before it; null unless card paid with a price. */
export function cardSurcharge(item: Priced, units: number, rate: number): number | null {
  const base = item.card_paid ? baseTotal(item, units) : null;
  return base === null ? null : Math.round(base * rate * 100) / 100;
}

/** The Trip total: every Item total on the quote but recommended experiences; null if any is On request. */
export function tripTotal(q: QuoteJson): number | null {
  const totals = [
    ...[...(q.flight_options ?? []), ...(q.transfers ?? []), ...(q.rail ?? []), ...(q.car_rentals ?? [])].map((x) => itemTotal(x)),
    ...(q.accommodation ?? []).flatMap((s) => (s.options ?? []).map((h) => itemTotal(h, num(h.rooms, 1)))),
    ...[...(q.packages ?? []), ...(q.visas ?? []), ...(q.insurance ?? []), ...(q.extras ?? [])].map((x) => itemTotal(x, x.units)),
  ];
  if (totals.includes(null)) return null;
  return Math.round((totals as number[]).reduce((a, b) => a + b, 0) * 100) / 100;
}

/** An Item total as printed. */
export function totalText(item: Priced, rooms = 1): string {
  const total = itemTotal(item, rooms);
  return total === null ? "On request" : money(total);
}
