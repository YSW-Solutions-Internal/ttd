// Turning a flight's codes into what the Client reads. Code does this, never Claude (ADR 0003).
// No imports, so this file also runs under plain `node` for codes.test.mjs.

export type AirportRow = {
  iata: string;
  name: string;
  city: string | null;
  city_code: string | null;
  country_code: string | null;
};
export type Place = { city: string | null; airport: string | null; country: string | null };

const CODE = /^[A-Z]{3}$/;

/** The 3-letter codes worth looking up, upper-cased and unique. */
export function placeCodes(codes: unknown[]): string[] {
  return [...new Set(codes.filter((c): c is string => typeof c === "string").map((c) => c.trim().toUpperCase()))].filter(
    (c) => CODE.test(c),
  );
}

/**
 * Code -> place. An airport code first (JNB: Johannesburg, O.R. Tambo International),
 * otherwise a city code (LON: London, no airport, since it could be any of several).
 */
export function placesFrom(rows: AirportRow[], codes: string[]): Map<string, Place> {
  const places = new Map<string, Place>();
  for (const code of codes) {
    const airport = rows.find((r) => r.iata.toUpperCase() === code);
    if (airport) {
      places.set(code, { city: airport.city, airport: airport.name, country: airport.country_code });
      continue;
    }
    const inCity = rows.filter((r) => r.city_code?.toUpperCase() === code);
    if (inCity.length) {
      const countries = new Set(inCity.map((r) => r.country_code));
      places.set(code, { city: inCity[0].city, airport: null, country: countries.size === 1 ? inCity[0].country_code : null });
    }
  }
  return places;
}

// shortcut: the usual IATA convention; airlines assign letters differently, so the Consultant can change the cabin.
const FIRST = new Set(["F", "A", "P"]);
const BUSINESS = new Set(["J", "C", "D", "I", "Z", "R"]);

/** Booking-class letter -> cabin in words. Null for anything that is not one letter. */
export function cabinFor(bookingClass: unknown): string | null {
  if (typeof bookingClass !== "string" || !/^[A-Za-z]$/.test(bookingClass.trim())) return null;
  const c = bookingClass.trim().toUpperCase();
  if (FIRST.has(c)) return "First";
  if (BUSINESS.has(c)) return "Business";
  if (c === "W") return "Premium Economy";
  return "Economy";
}

type Row = Record<string, unknown>;

/** Fills a flight's empty city, airport and cabin fields from its codes (Q74: typed names are kept). */
export function fillFlightNames(flight: Row, places: Map<string, Place>): Row {
  for (const end of ["from", "to"] as const) {
    const code = flight[`${end}_code`];
    const place = typeof code === "string" ? places.get(code.trim().toUpperCase()) : undefined;
    if (!place) continue;
    flight[`${end}_city`] ||= place.city;
    flight[`${end}_airport`] ||= place.airport;
  }
  flight.cabin ||= cabinFor(flight.booking_class);
  return flight;
}

