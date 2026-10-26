// No imports, so both the browser (edit screen) and plain `node` (tests) can use it.

/** Item table -> the kind stored in entity_id, item_refs and fee_rates. */
export const TABLE_KIND = {
  flight_options: "flight",
  accommodation_options: "hotel",
  car_rentals: "car_rental",
  transfers: "transfer",
  rail_journeys: "rail",
  excursions: "excursion",
} as const;
export type ItemTable = keyof typeof TABLE_KIND;
