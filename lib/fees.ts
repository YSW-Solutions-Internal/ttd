// Fee region, variant, fee lookup and year filling (GLOSSARY: Fee region, Transaction fee ...).
// No imports, so this file also runs under plain `node` for fees.test.mjs.

export const FEE_REGIONS = ["domestic", "neighbouring", "local_international", "international"] as const;
export type FeeRegion = (typeof FEE_REGIONS)[number];
export const VARIANTS = ["", "premium", "side_ticket"] as const;
export type Variant = (typeof VARIANTS)[number];
export const FEE_FIELDS = ["transaction_fee", "change_fee", "refund_fee", "prepayment_fee"] as const;

/** ISO codes, so "Swaziland" and "Eswatini" are both SZ. */
const NEIGHBOURING = new Set(["MZ", "BW", "ZW", "NA", "SZ", "LS", "ZM"]);
/** Booking-class letters for business and first (the industry convention; airlines differ, hence the dropdown). */
const PREMIUM_CLASSES = new Set(["J", "C", "D", "I", "Z", "F", "A", "P"]);

/**
 * The Fee region from the countries an Item touches: every airport of a flight
 * option, or the one country of anything else. Null if any country is unknown.
 */
export function feeRegion(countries: (string | null | undefined)[], flight: boolean): FeeRegion | null {
  if (countries.length === 0 || countries.some((c) => !c)) return null;
  const cs = countries.map((c) => c!.toUpperCase());
  if (cs.every((c) => c === "ZA")) return "domestic";
  if (flight && new Set(cs).size === 1) return "local_international";
  if (cs.every((c) => c === "ZA" || NEIGHBOURING.has(c))) return "neighbouring";
  return "international";
}

/** Premium if any flight is business or first; mixed cabins take the highest. */
export function cabinVariant(cabins: (string | null | undefined)[]): Variant {
  return cabins.some((c) => c && (/business|first/i.test(c) || PREMIUM_CLASSES.has(c.trim().toUpperCase())))
    ? "premium"
    : "";
}

function isRealDate(s: string): boolean {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * "--09-15" (no year printed) becomes the next 15 September on or after `from`
 * (the day the Quote was created, YYYY-MM-DD). Anything else is returned unchanged.
 */
export function fillYear<T>(value: T, from: string): T | string {
  const m = typeof value === "string" ? /^--(\d{2})-(\d{2})$/.exec(value) : null;
  if (!m) return value;
  let year = Number(from.slice(0, 4));
  if (`${m[1]}-${m[2]}` < from.slice(5, 10)) year += 1;
  // 29 Feb only exists in leap years; give up after a few tries rather than loop on nonsense like --13-40.
  for (let i = 0; i < 8; i++, year++) {
    const s = `${year}-${m[1]}-${m[2]}`;
    if (isRealDate(s)) return s;
  }
  return value;
}

export type Stay = { id: string; starts_on: string | null; ends_on: string | null; country_code: string | null };

/** The Stay whose dates include `date` (YYYY-MM-DD), first by position. */
export function stayCovering(stays: Stay[], date: unknown): Stay | undefined {
  if (typeof date !== "string" || !isRealDate(date)) return undefined;
  return stays.find((s) => s.starts_on && s.ends_on && s.starts_on <= date && date <= s.ends_on);
}

export type FeeRate = {
  kind: string;
  fee_region: string;
  variant: string;
  transaction_fee: number;
  change_fee: number;
  refund_fee: number;
  prepayment_fee: number;
};

/** The schedule row for an Item. Only international flights have variants. */
export function rateFor(rates: FeeRate[], kind: string, region: unknown, variant: unknown): FeeRate | undefined {
  const v = kind === "flight" && region === "international" ? (variant ?? "") : "";
  return rates.find((r) => r.kind === kind && r.fee_region === region && r.variant === v);
}

/** The car 10% suggestion: 10% of the price when that is more than the Pre-payment fee, else null. */
export function tenPercent(price: unknown, prepaymentFee: unknown): number | null {
  if (typeof price !== "number" || typeof prepaymentFee !== "number") return null;
  const ten = Math.round(price * 10) / 100;
  return ten > prepaymentFee ? ten : null;
}

type Row = Record<string, unknown>;

/** The date that places an Item that is not a flight in a Stay. */
const PLACING_DATE: Record<string, string> = {
  hotel: "check_in_date",
  car_rental: "pickup_date",
  transfer: "date",
  rail: "date",
  excursion: "start_date",
};

/**
 * What applyFees works out when the region is empty: from the airports' countries
 * for a flight option, otherwise from the Stay the Item is in (an Accommodation
 * option's chosen Stay, or the Stay covering the Item's date).
 * `airports` maps an upper-case IATA code to its country code.
 */
export function autoRegion(
  kind: string,
  row: Row,
  flights: Row[],
  stays: Stay[],
  airports: Map<string, string | null>,
): { region: FeeRegion | null; variant: Variant } {
  if (kind === "flight") {
    const codes = flights.flatMap((f) => [f.from_code, f.to_code]);
    const countries = codes.map((c) => (typeof c === "string" ? airports.get(c.trim().toUpperCase()) : null));
    return { region: feeRegion(countries, true), variant: cabinVariant(flights.map((f) => f.cabin as string)) };
  }
  const chosen = kind === "hotel" && row.stay_id ? stays.find((s) => s.id === row.stay_id) : undefined;
  const stay = chosen ?? stayCovering(stays, row[PLACING_DATE[kind]]);
  return { region: stay ? feeRegion([stay.country_code], false) : null, variant: "" };
}

/**
 * Fills an Item row's Fee region, variant and fees before it is written.
 *  - Region and variant are worked out only while the region is empty; a region
 *    already on the row (worked out earlier, or chosen by the Consultant) is kept.
 *  - Fees come from the schedule when the row is new, when its region or variant
 *    changed, or when a fee is empty. A fee the Consultant typed is otherwise kept.
 *  - A prepaid car rental with the 10% fee ticked gets 10% of its price instead.
 * `prev` is the row as stored (null for a new row). Mutates and returns `row`.
 */
export function applyFees(
  kind: string,
  row: Row,
  prev: Row | null,
  auto: { region: FeeRegion | null; variant: Variant },
  rates: FeeRate[],
): Row {
  if (!row.fee_region) {
    row.fee_region = auto.region;
    row.variant = kind === "flight" ? auto.variant : "";
  }
  const rate = rateFor(rates, kind, row.fee_region, row.variant);
  const keyChanged = !prev || prev.fee_region !== row.fee_region || prev.variant !== row.variant;
  for (const f of FEE_FIELDS) {
    if (keyChanged || row[f] == null) row[f] = rate?.[f] ?? null;
  }
  if (kind === "car_rental") {
    if (row.ten_percent_fee && row.prepaid) {
      row.prepayment_fee = tenPercent(row.price, rate?.prepayment_fee) ?? rate?.prepayment_fee ?? null;
    } else if (prev?.ten_percent_fee) {
      row.prepayment_fee = rate?.prepayment_fee ?? null;
    }
  }
  return row;
}
