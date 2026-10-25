/**
 * The shape of Claude's answer. It is sent in the prompt, not enforced by the API:
 * as structured outputs it compiled into a grammar the API rejected as too large
 * (ADR 0003). parse.ts checks the answer instead.
 *
 * A value that is not shown comes back as "", and numbers as digit strings
 * ("13111.80"); parse.ts turns "" into null and digits into numbers. Every price is
 * one figure in Rand (all prices are).
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

const flight = obj({
  airline: str,
  flight_no: str,
  operated_by: str,
  aircraft: str,
  from_code: str,
  from_city: str,
  from_airport: str,
  to_code: str,
  to_city: str,
  to_airport: str,
  date: str,
  departs: str,
  arrives: str,
  next_day: bool,
  flying_time: str,
  stops: str,
  baggage: str,
  booking_class: str,
  cabin: str,
});

const flightOption = obj({
  label: str,
  directions: arr(
    obj({
      label: str,
      fare_basis: str,
      flights: arr(flight),
    }),
  ),
  fare_rules: str,
  seating: str,
  notes: str,
  total_price: str,
  lines: arr(obj({ pax_label: str, count: str, fare_pp: str, taxes_pp: str })),
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
  price: str,
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
  price: str,
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
  price: str,
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
  price: str,
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
  price: str,
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
