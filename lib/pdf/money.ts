// Item totals and money formatting for the quote PDF (GLOSSARY: Item total, Transaction fee, Markup, Pre-payment fee).
import type { Amount, Priced } from "./types";

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

/**
 * The Item total: price + Transaction fee (per room for Accommodation) + Markup,
 * + Pre-payment fee when prepaid. Refund and Change fees are shown, never added.
 * Null when the price is missing, which can only mean "On request".
 */
export function itemTotal(item: Priced, rooms = 1): number | null {
  if (item.price === null || item.price === undefined || item.price === "") return null;
  return (
    num(item.price) +
    num(item.transaction_fee) * Math.max(1, Math.trunc(num(rooms, 1))) +
    num(item.markup) +
    (item.prepaid ? num(item.prepayment_fee) : 0)
  );
}

/** An Item total as printed. */
export function totalText(item: Priced, rooms = 1): string {
  const total = itemTotal(item, rooms);
  return total === null ? "On request" : money(total);
}
