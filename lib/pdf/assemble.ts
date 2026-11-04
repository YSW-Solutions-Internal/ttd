// The deterministic assembler (ADR 0002): a Quote's rows -> the quote JSON a Version freezes.
// Pure, with .ts / type-only imports, so assemble.test.ts runs under plain `node`.
import type { AccommodationStay, FlightOption, Priced, QuoteJson } from "./types";
import { feeUnits, money, tripTotal } from "./money.ts";
import { EXTRA_FIELDS, EXTRA_TYPES } from "../extraction/tables.ts";

type Row = Record<string, any>;

export type AssembleInput = {
  /** YYYY-MM-DD, the day the Version is generated. */
  today: string;
  /** An Accepted version (GLOSSARY): everything on it is taken, so it gets a Trip total. */
  accepted?: boolean;
  /** The Trip's reference; generate_version appends " V<n>". */
  reference: string;
  consultant: { name: string; email?: string };
  client: { name: string; code: string };
  trip: Row; // title, starts_on, ends_on, nights, adults, children, terms_profile, custom_notes
  stays: Row[]; // trip_stops in position order
  /** Item rows of the Quote, removed images' Items already left out, in creation order. */
  items: {
    flight_options: Row[];
    flights: Row[];
    accommodation_options: Row[];
    transfers: Row[];
    rail_journeys: Row[];
    car_rentals: Row[];
    excursions: Row[];
    packages: Row[];
    visas: Row[];
    insurance_policies: Row[];
    extras: Row[];
  };
  /** IATA code -> airline name, confirmed names only (migration 0012). */
  airlines: Map<string, string>;
  /** Traveller id -> "First Last", the Trip's Travellers. */
  travellers: Map<string, string>;
  /** Trip checklist key -> note (trip_checks). */
  checks: Record<string, string | null>;
};

export type VersionItem = { entity_id: string; kind: string; option_no: number };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2027-04-04" -> "4 Apr" (with the year: "4 Apr 2027"). Anything else is shown as stored. */
export function day(value: unknown, withYear = false): string {
  if (typeof value !== "string") return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return value;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}${withYear ? ` ${m[1]}` : ""}`;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function range(from: unknown, to: unknown): string {
  return [day(from), day(to)].filter(Boolean).join(" – ");
}

function at(date: unknown, time: unknown): string {
  return [day(date), time].filter(Boolean).join(" ");
}

function priced(r: Row): Priced {
  return {
    price: r.price,
    markup: r.markup,
    transaction_fee: r.transaction_fee,
    prepayment_fee: r.prepayment_fee,
    prepaid: r.prepaid,
    change_fee: r.change_fee,
    refund_fee: r.refund_fee,
    card_paid: r.card_paid,
    card_surcharge: r.card_surcharge,
  };
}

/** What stops this Quote becoming a Version (GLOSSARY: Stay, Generate version, Accepted version). Empty means go ahead. */
export function problems(items: AssembleInput["items"], accepted = false): string[] {
  const out: string[] = [];
  for (const h of items.accommodation_options) {
    if (!h.stay_id) out.push(`${h.hotel_name || "An Accommodation option"} is not placed in a Stay.`);
  }
  const named: [Row[], string, string][] = [
    [items.flight_options, "label", "A Flight option"],
    [items.accommodation_options, "hotel_name", "An Accommodation option"],
    [items.transfers, "supplier", "A Transfer"],
    [items.rail_journeys, "service", "A Rail journey"],
    [items.car_rentals, "company", "A car rental"],
    [items.excursions, "description", "An Experience"],
    [items.packages, "name", "A Package"],
    [items.visas, "country", "A Visa"],
    [items.insurance_policies, "insurer", "An Insurance policy"],
    [items.extras, "description", "An Extra"],
  ];
  for (const [rows, field, fallback] of named) {
    for (const r of rows) {
      // A missing fee would print as R 0 and undercharge; a missing price prints "On request".
      if (r.price != null && r.transaction_fee == null) out.push(`${r[field] || fallback} has a price but no Transaction fee.`);
      // Recommended experiences are priced separately, never in the Trip total.
      if (accepted && r.price == null && rows !== items.excursions) out.push(`${r[field] || fallback} is On request. Price every Item before generating an Accepted version.`);
    }
  }
  for (const x of items.extras) {
    if (x.extra_type === "conference" && x.people == null) out.push("A Conference has no number of people.");
  }
  return out;
}

export function assembleQuote(input: AssembleInput): { quote: QuoteJson; items: VersionItem[] } {
  const { trip, stays, items } = input;
  const versionItems: VersionItem[] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const number = (rows: Row[], kind: string) =>
    rows.forEach((r, i) => versionItems.push({ entity_id: r.entity_id, kind, option_no: i + 1 }));

  const airline = (code: unknown) => (typeof code === "string" && input.airlines.get(code.toUpperCase())) || code;

  const flightOptions: FlightOption[] = items.flight_options.map((o, i) => {
    const flights = items.flights
      .filter((f) => f.flight_option_id === o.id)
      .sort((a, b) => a.direction_no - b.direction_no || a.seq - b.seq);
    const directions = [...new Set(flights.map((f) => f.direction_no))];
    const airlines = [...new Set(flights.map((f) => airline(f.airline)).filter(Boolean))].join(", ");
    return {
      ...priced(o),
      label: `${input.accepted ? "Flight" : "Option"} ${i + 1}`,
      headline: o.label || airlines,
      airlines,
      fare_rules: o.fare_rules,
      seating: o.seating,
      notes: o.notes,
      groups: directions.map((n) => {
        const fs = flights.filter((f) => f.direction_no === n);
        return {
          label: fs[0].direction_label || (n === 1 ? "Outbound" : n === 2 && directions.length === 2 ? "Return" : `Part ${n}`),
          meta: day(fs[0].date) || null,
          flights: fs.map((f) => ({
            airline: f.airline,
            flight_no: f.flight_no,
            aircraft: f.aircraft,
            from_city: f.from_city,
            from_code: f.from_code,
            to_city: f.to_city,
            to_code: f.to_code,
            date: day(f.date),
            departs: f.departs,
            arrives: f.arrives,
            next_day: f.next_day,
            cabin: f.cabin,
            flying_time: f.flying_time,
            stops: f.stops,
            baggage: f.baggage,
          })),
        };
      }),
    };
  });
  number(items.flight_options, "flight");

  // Options are numbered within their Stay, as the PDF labels them.
  const accommodation: AccommodationStay[] = [];
  for (const s of stays) {
    const options = items.accommodation_options.filter((h) => h.stay_id === s.id);
    if (options.length === 0) continue;
    number(options, "hotel");
    accommodation.push({
      name: s.destination,
      dates: range(s.starts_on, s.ends_on) || null,
      nights: s.nights,
      options: options.map((h) => ({
        ...priced(h),
        name: h.hotel_name,
        star: h.star,
        room: h.room,
        rooms: h.rooms,
        address: h.address,
        geo_url: h.geo_url,
        url: h.url,
        url_label: h.url_label,
        check_in: at(h.check_in_date, h.check_in_time),
        check_out: at(h.check_out_date, h.check_out_time),
        meals: h.meals,
        cxl_type: h.cxl_type,
        cxl: h.cxl,
        notes: h.notes,
      })),
    });
  }

  const transfers = items.transfers.map((t) => ({
    ...priced(t),
    date: at(t.date, t.time),
    supplier: t.supplier,
    route: [t.from_place, t.to_place].filter(Boolean).join(" → "),
    vehicle: t.vehicle,
  }));
  number(items.transfers, "transfer");

  const rail = items.rail_journeys.map((r) => ({
    ...priced(r),
    date: at(r.date, r.departs),
    service: [r.operator, r.service, r.travel_class].filter(Boolean).join(" · "),
    from_city: r.from_station,
    to_city: r.to_station,
  }));
  number(items.rail_journeys, "rail");

  const carRentals = items.car_rentals.map((c) => ({
    ...priced(c),
    pickup_datetime: at(c.pickup_date, c.pickup_time),
    pickup_location: c.pickup_location,
    dropoff_datetime: at(c.dropoff_date, c.dropoff_time),
    dropoff_location: c.dropoff_location,
    vehicle: c.vehicle,
    company: c.company,
  }));
  number(items.car_rentals, "car_rental");

  const experiences = items.excursions.map((e) => ({
    ...priced(e),
    location: e.location,
    start_date: at(e.start_date, e.start_time),
    provider_name: e.provider_name,
    description: e.description,
  }));
  number(items.excursions, "excursion");

  const packages = items.packages.map((p) => ({
    ...priced(p),
    units: feeUnits("package", p),
    name: p.name,
    operator: p.operator,
    destination: p.destination,
    dates: range(p.start_date, p.end_date),
    deposit_line:
      p.deposit == null ? null : [`Deposit ${money(p.deposit)} now`, p.balance_due_on && `balance by ${day(p.balance_due_on, true)}`].filter(Boolean).join(", "),
  }));
  number(items.packages, "package");

  const visas = items.visas.map((v) => ({
    ...priced(v),
    units: feeUnits("visa", v),
    country: v.country,
    visa_type: v.visa_type,
    traveller: input.travellers.get(v.traveller_id) ?? null,
  }));
  number(items.visas, "visa");

  const insurance = items.insurance_policies.map((p) => ({
    ...priced(p),
    units: feeUnits("insurance", p),
    insurer: p.insurer,
    policy_type: p.policy_type,
    dates: range(p.start_date, p.end_date),
    travellers: ((p.traveller_ids ?? []) as string[]).map((id) => input.travellers.get(id)).filter(Boolean).join(", "),
  }));
  number(items.insurance_policies, "insurance");

  const extraLabels = new Map(EXTRA_TYPES);
  const extras = items.extras.map((x) => {
    const mine = (f: string) => (EXTRA_FIELDS[x.extra_type] ?? []).includes(f);
    return {
    ...priced(x),
    units: feeUnits("extra", x),
    type: extraLabels.get(x.extra_type) ?? x.extra_type,
    description: x.description,
    // The edit screen hides other types' fields without clearing them, so print only this type's.
    detail: [
      mine("date") && at(x.date, x.time),
      mine("airport") && x.airport,
      mine("seats") && x.seats && `Seats ${x.seats}`,
      mine("bags") && x.bags && `Bags ${x.bags}`,
      mine("people") && x.people && plural(Number(x.people), "person", "people"),
      mine("period") && x.period,
    ]
      .filter(Boolean)
      .join(" · "),
  };
  });
  number(items.extras, "extra");

  const adults = Number(trip.adults ?? 0);
  const children = Number(trip.children ?? 0);

  const quote: QuoteJson = {
    reference: input.reference,
    date: day(input.today, true),
    valid_until: day(addDays(input.today, 7), true),
    consultant: input.consultant,
    client: { name: input.client.name, file_ref: input.client.code },
    trip: {
      title: trip.title ?? undefined,
      destinations: stays.map((s) => s.destination),
      dates_display: range(trip.starts_on, trip.ends_on),
      year: typeof trip.starts_on === "string" ? trip.starts_on.slice(0, 4) : undefined,
      nights: trip.nights,
      travellers_main: plural(adults, "Adult", "Adults"),
      travellers_sub: children > 0 ? plural(children, "Child", "Children") : null,
    },
    itinerary_overview: stays.map((s) => ({
      dates: range(s.starts_on, s.ends_on),
      destination: s.destination,
      nights: s.nights,
      highlight: s.highlight,
    })),
    flight_options: flightOptions,
    accommodation,
    transfers,
    rail,
    car_rentals: carRentals,
    experiences,
    packages,
    visas,
    insurance,
    extras,
    visa_info: input.checks.visa ?? null,
    health_info: input.checks.health ?? null,
    insurance_info: input.checks.insurance ?? null,
    terms_profile: trip.terms_profile ?? undefined,
    custom_notes: String(trip.custom_notes ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  };
  if (input.accepted) quote.trip_total = tripTotal(quote);
  return { quote, items: versionItems };
}
