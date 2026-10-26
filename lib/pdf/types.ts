// The quote JSON a Version freezes (quote_versions.assembled) and the PDF is rendered from.
// The assembler must produce this shape; sample-quote.json is a full example.
// Amounts are plain Rand numbers (or numeric strings); the renderer works out Item totals and formats them.

export type Amount = number | string | null | undefined;

/**
 * An Item's price and fees, named as on the Item tables. price is the supplier's price for
 * everyone, taxes included; null means "On request". See money.ts itemTotal for what is added.
 */
export type Priced = {
  price?: Amount;
  markup?: Amount;
  transaction_fee?: Amount;
  prepayment_fee?: Amount;
  prepaid?: boolean;
  change_fee?: Amount;
  refund_fee?: Amount;
};

export type Flight = {
  airline?: string;
  flight_no?: string;
  aircraft?: string | null;
  from_city?: string;
  from_code?: string | null;
  to_city?: string;
  to_code?: string | null;
  date?: string;
  departs?: string;
  arrives?: string;
  next_day?: boolean;
  cabin?: string | null;
  flying_time?: string | null;
  stops?: number | null;
  baggage?: string | null;
};

export type FlightGroup = { label?: string; meta?: string | null; flights?: Flight[] };

export type FlightOption = Priced & {
  label?: string;
  headline?: string;
  airlines?: string;
  summary_line?: string | null;
  fare_rules?: string | null;
  seating?: string | null;
  notes?: string | null;
  groups?: FlightGroup[];
};

export type AccommodationOption = Priced & {
  name?: string;
  star?: number | null;
  room?: string;
  /** Rooms booked; the Transaction fee is per room. */
  rooms?: Amount;
  address?: string | null;
  geo_url?: string | null;
  url?: string | null;
  url_label?: string | null;
  check_in?: string;
  check_out?: string;
  meals?: string | null;
  cxl_type?: "free" | "nonref" | null;
  cxl?: string | null;
  notes?: string | null;
  desc?: string | null;
};

/** One Stay: a destination with the Accommodation options offered for it. */
export type AccommodationStay = { name?: string; dates?: string | null; nights?: Amount; options?: AccommodationOption[] };

export type Transfer = Priced & {
  date?: string;
  supplier?: string | null;
  route?: string;
  vehicle?: string | null;
};

export type Rail = Priced & {
  date?: string;
  service?: string;
  from_city?: string;
  to_city?: string;
};

export type CarRental = Priced & {
  pickup_datetime?: string;
  pickup_location?: string | null;
  dropoff_datetime?: string;
  dropoff_location?: string | null;
  vehicle?: string | null;
  company?: string | null;
};

export type Experience =
  | string
  | (Priced & {
      location?: string | null;
      start_date?: string | null;
      date?: string | null;
      provider_name?: string | null;
      provider?: string | null;
      name?: string | null;
      description?: string | null;
    });

export type ItineraryStop = { dates?: string; destination?: string; nights?: Amount; highlight?: string | null };

export type QuoteJson = {
  /** As shown on the PDF, including the Version: "QU-RWOL01-001 V2". */
  reference: string;
  date: string;
  valid_until: string;
  consultant: { name: string; email?: string; address?: string };
  client: { name?: string; file_ref?: string | null };
  trip: {
    title?: string;
    destinations?: string[];
    dates_display?: string;
    year?: string | number;
    nights?: Amount;
    travellers_main?: string;
    travellers_sub?: string | null;
  };
  itinerary_overview?: ItineraryStop[];
  flights_tag?: string | null;
  flight_options?: FlightOption[];
  accommodation?: AccommodationStay[];
  transfers?: Transfer[] | null;
  rail?: Rail[] | null;
  car_rentals?: CarRental[] | null;
  experiences?: Experience[] | null;
  visa_info?: string | null;
  health_info?: string | null;
  insurance_info?: string | null;
  not_yet_included?: string[] | null;
  terms_profile?: string;
  custom_notes?: string[] | null;
};
