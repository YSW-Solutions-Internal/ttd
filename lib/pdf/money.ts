// Ported from render_lib.py: totals and money formatting for the quote PDF.
import type { Amount, Fees, FlightPricing } from "./types";

const SYMS: Record<string, string> = { ZAR: "R", USD: "$", EUR: "€", GBP: "£" };

/** A number from JSON; null, empty or non-numeric text gives the fallback. */
export function num(value: Amount | unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const s = String(value).replaceAll(" ", "");
  const n = Number(s);
  return s !== "" && Number.isFinite(n) ? n : fallback; // Number("") is 0, Python's float("") fails
}

/** Unknown currencies show their code (e.g. AUD) instead of R. */
export function symFor(currency: string | null | undefined): string {
  const cur = currency || "ZAR";
  return SYMS[cur] ?? cur;
}

/** "R 12 345.67": space as the thousands separator, two decimals. */
export function money(amount: Amount, sym: string): string {
  const [whole, cents] = Math.abs(num(amount)).toFixed(2).split(".");
  const sign = num(amount) < 0 && Number(`${whole}.${cents}`) !== 0 ? "-" : "";
  return `${sym} ${sign}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${cents}`;
}

/** base plus markup and transaction fee; cancellation and change fees are shown only, never added. */
export function withFees(item: Fees, base: number): number {
  return base + num(item.markup) + num(item.transaction_fee);
}

/** All-in total of a flight option: every line's (fare + taxes) x count, plus fees. */
export function flightTotal(pricing: FlightPricing): number {
  const lines = (pricing.lines ?? []).reduce((sum, line) => {
    let n = num(line.count, 1);
    if (n <= 0) n = 1; // a count can only be 1 and up
    return sum + (num(line.fare_pp) + num(line.taxes_pp)) * Math.trunc(n);
  }, 0);
  return withFees(pricing, lines);
}
