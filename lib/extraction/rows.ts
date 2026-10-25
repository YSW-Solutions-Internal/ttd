import { randomUUID } from "node:crypto";
import type { ExtractedItem } from "./types";

// Only `import type` above, so this file also runs under plain `node` for rows.test.mjs.

/** Rows for store_extraction (migration 0009): table name -> rows keyed by column name. */
export type ItemRows = Record<
  | "flight_options"
  | "flights"
  | "accommodation_options"
  | "car_rentals"
  | "transfers"
  | "rail_journeys"
  | "excursions",
  Record<string, unknown>[]
>;

type Data = Record<string, any>;
type Price = { amount: number | null; text: string | null } | null | undefined;

/** The columns every Item table has. Every row of one table must have the same keys. */
function common(quoteId: string, imageId: string, item: ExtractedItem, currency: unknown, price: Price) {
  return {
    quote_id: quoteId,
    image_id: imageId,
    entity_id: item.entity_id,
    currency: currency ?? null,
    price: price?.amount ?? null,
    price_text: price?.text ?? null,
    price_note: null as string | null,
    notes: item.data.notes ?? null,
  };
}

/**
 * When the image shows no total for everyone, work it out from the per-passenger
 * lines (count x (fare + taxes)), but only if every line is complete. Flagged for the
 * Consultant, because it is the one price code works out instead of copying.
 */
function totalFromLines(lines: Data[] | null | undefined): number | null {
  if (!lines?.length) return null;
  let total = 0;
  for (const l of lines) {
    if (l.count == null || l.fare_pp?.amount == null) return null;
    total += l.count * (l.fare_pp.amount + (l.taxes_pp?.amount ?? 0));
  }
  return Math.round(total * 100) / 100;
}

export function toItemRows(quoteId: string, imageId: string, items: ExtractedItem[]): ItemRows {
  const rows: ItemRows = {
    flight_options: [],
    flights: [],
    accommodation_options: [],
    car_rentals: [],
    transfers: [],
    rail_journeys: [],
    excursions: [],
  };

  for (const item of items) {
    const d: Data = item.data;
    switch (item.kind) {
      case "flight": {
        const id = randomUUID();
        const row = {
          id,
          ...common(quoteId, imageId, item, d.pricing?.currency, d.pricing?.total_price),
          label: d.label ?? null,
          fare_rules: d.fare_rules ?? null,
          seating: d.seating ?? null,
        };
        if (row.price == null) {
          const worked = totalFromLines(d.pricing?.lines);
          if (worked != null) {
            row.price = worked;
            row.price_note = "Worked out from the per-passenger prices; check it against the image.";
          }
        }
        rows.flight_options.push(row);
        (d.directions ?? []).forEach((dir: Data, i: number) =>
          (dir.flights ?? []).forEach((f: Data, j: number) =>
            rows.flights.push({
              flight_option_id: id,
              direction_no: i + 1,
              direction_label: dir.label ?? null,
              fare_basis: dir.fare_basis ?? null,
              seq: j + 1,
              airline: f.airline ?? null,
              flight_no: f.flight_no ?? null,
              aircraft: f.aircraft ?? null,
              from_city: f.from_city ?? null,
              from_code: f.from_code ?? null,
              to_city: f.to_city ?? null,
              to_code: f.to_code ?? null,
              date: f.date ?? null,
              departs: f.departs ?? null,
              arrives: f.arrives ?? null,
              next_day: f.next_day === true,
              flying_time: f.flying_time ?? null,
              stops: f.stops ?? null,
              baggage: f.baggage ?? null,
              cabin: f.cabin ?? null,
            }),
          ),
        );
        break;
      }
      case "hotel":
        rows.accommodation_options.push({
          ...common(quoteId, imageId, item, d.currency, d.price),
          location_name: d.location_name ?? null,
          hotel_name: d.hotel_name ?? null,
          star: d.star ?? null,
          room: d.room ?? null,
          meals: d.meals ?? null,
          check_in_date: d.check_in_date ?? null,
          check_in_time: d.check_in_time ?? null,
          check_out_date: d.check_out_date ?? null,
          check_out_time: d.check_out_time ?? null,
          nights: d.nights ?? null,
          rooms: d.rooms ?? 1,
          cxl_type: d.cxl_type ?? null,
          cxl: d.cxl ?? null,
          address: d.address ?? null,
          geo_url: d.geo_url ?? null,
          url: d.url ?? null,
          url_label: d.url_label ?? null,
        });
        break;
      case "car_rental":
        rows.car_rentals.push({
          ...common(quoteId, imageId, item, d.currency, d.price),
          company: d.company ?? null,
          vehicle: d.vehicle ?? null,
          pickup_location: d.pickup_location ?? null,
          dropoff_location: d.dropoff_location ?? null,
          pickup_date: d.pickup_date ?? null,
          pickup_time: d.pickup_time ?? null,
          dropoff_date: d.dropoff_date ?? null,
          dropoff_time: d.dropoff_time ?? null,
        });
        break;
      case "transfer":
        rows.transfers.push({
          ...common(quoteId, imageId, item, d.currency, d.price),
          supplier: d.supplier ?? null,
          from_place: d.from ?? null,
          to_place: d.to ?? null,
          date: d.date ?? null,
          time: d.time ?? null,
          vehicle: d.vehicle ?? null,
          passengers: d.passengers ?? null,
        });
        break;
      case "rail":
        rows.rail_journeys.push({
          ...common(quoteId, imageId, item, d.currency, d.price),
          operator: d.operator ?? null,
          service: d.service ?? null,
          from_station: d.from_station ?? null,
          to_station: d.to_station ?? null,
          date: d.date ?? null,
          departs: d.departs ?? null,
          arrives: d.arrives ?? null,
          travel_class: d.class ?? null,
        });
        break;
      case "excursion":
        rows.excursions.push({
          ...common(quoteId, imageId, item, d.currency, d.price),
          provider_name: d.provider_name ?? null,
          description: d.description ?? null,
          location: d.location ?? null,
          start_date: d.start_date ?? null,
          start_time: d.start_time ?? null,
          end_date: d.end_date ?? null,
          end_time: d.end_time ?? null,
        });
        break;
    }
  }
  return rows;
}
