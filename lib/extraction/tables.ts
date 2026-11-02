// No imports, so both the browser (edit screen) and plain `node` (tests) can use it.

/** Item table -> the kind stored in entity_id, item_refs and fee_rates. */
export const EXTRACTED_KIND = {
  flight_options: "flight",
  accommodation_options: "hotel",
  car_rentals: "car_rental",
  transfers: "transfer",
  rail_journeys: "rail",
  excursions: "excursion",
} as const;
export const TABLE_KIND = {
  ...EXTRACTED_KIND,
  packages: "package",
  visas: "visa",
  insurance_policies: "insurance",
  extras: "extra",
} as const;
export type ItemTable = keyof typeof TABLE_KIND;

/** Extra types in display order: [value, label]. */
export const EXTRA_TYPES: [string, string][] = [
  ["preseat", "Pre-seating"],
  ["baggage", "Additional baggage"],
  ["after_hours", "After hours emergency service"],
  ["meet_greet", "Airport meet and greet"],
  ["conference", "Conference (per person)"],
  ["report_mis", "MIS report"],
  ["report_adhoc", "Ad hoc report"],
];
