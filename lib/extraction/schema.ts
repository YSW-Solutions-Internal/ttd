/**
 * The JSON schema Claude's answer must match (structured outputs).
 *
 * No field is nullable on the wire: the API allows at most 16 union-typed fields
 * per request and this schema has far more unknowable values. So a value that is
 * not shown comes back as "", and numbers come back as digit strings
 * ("13111.80"). parse.ts turns "" into null and digit strings into numbers.
 */

const str = { type: "string" } as const;
const bool = { type: "boolean" } as const;

function obj(properties: Record<string, unknown>) {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  } as const;
}

function arr(items: unknown) {
  return { type: "array", items } as const;
}

/** A price as Claude read it: the bare number, and the text exactly as printed. */
const price = obj({ amount: str, text: str });

const flight = obj({
  airline: str,
  flight_no: str,
  aircraft: str,
  from_city: str,
  from_code: str,
  to_city: str,
  to_code: str,
  date: str,
  departs: str,
  arrives: str,
  next_day: bool,
  flying_time: str,
  stops: str,
  baggage: str,
  cabin: str,
});

const flightOption = obj({
  label: str,
  directions: arr(
    obj({
      label: str,
      fare_basis: str,
      price_shown: price,
      flights: arr(flight),
    }),
  ),
  fare_rules: str,
  seating: str,
  notes: str,
  pricing: obj({
    currency: str,
    total_price: price,
    vat: price,
    lines: arr(obj({ pax_label: str, count: str, fare_pp: price, taxes_pp: price })),
  }),
});

const hotel = obj({
  location_name: str,
  hotel_name: str,
  star: str,
  room: str,
  meals: str,
  check_in_date: str,
  check_in_time: str,
  check_out_date: str,
  check_out_time: str,
  nights: str,
  rooms: str,
  currency: str,
  price: price,
  cxl_type: { type: "string", enum: ["free", "nonref", ""] },
  cxl: str,
  address: str,
  geo_url: str,
  url: str,
  url_label: str,
  notes: str,
});

const carRental = obj({
  company: str,
  vehicle: str,
  pickup_location: str,
  dropoff_location: str,
  pickup_date: str,
  pickup_time: str,
  dropoff_date: str,
  dropoff_time: str,
  currency: str,
  price: price,
  notes: str,
});

const excursion = obj({
  provider_name: str,
  description: str,
  location: str,
  start_date: str,
  start_time: str,
  end_date: str,
  end_time: str,
  currency: str,
  price: price,
  notes: str,
});

const transfer = obj({
  supplier: str,
  from: str,
  to: str,
  date: str,
  time: str,
  vehicle: str,
  passengers: str,
  currency: str,
  price: price,
  notes: str,
});

const rail = obj({
  operator: str,
  service: str,
  from_station: str,
  to_station: str,
  date: str,
  departs: str,
  arrives: str,
  class: str,
  currency: str,
  price: price,
  notes: str,
});

export const SOURCE_TYPES = ["GENERIC_QUOTE", "GALILEO_GDS", "BOOKING_PAD", "UNKNOWN", "NONE"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const EXTRACTION_SCHEMA = obj({
  source_type: { type: "string", enum: SOURCE_TYPES },
  source_confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
  source_reason: str,
  flight: arr(flightOption),
  hotel: arr(hotel),
  car_rental: arr(carRental),
  excursion: arr(excursion),
  transfer: arr(transfer),
  rail: arr(rail),
});
