// The editable fields of each Item table: what the edit screen shows and the only
// columns saveItem will write. Shared by the form (client) and the action (server).
import type { ItemTable } from "@/lib/extraction/tables";

export type FieldType = "text" | "textarea" | "number" | "date" | "time" | "checkbox" | "select";
export type Field = { name: string; label: string; type: FieldType; options?: [string, string][] };

const t = (name: string, label: string, type: FieldType = "text"): Field => ({ name, label, type });

export const ITEM_LABEL: Record<ItemTable, string> = {
  flight_options: "Flight option",
  accommodation_options: "Accommodation option",
  car_rentals: "Car rental",
  transfers: "Transfer",
  rail_journeys: "Rail journey",
  excursions: "Experience",
};

export const ITEM_FIELDS: Record<ItemTable, Field[]> = {
  flight_options: [t("label", "Label"), t("fare_rules", "Fare rules", "textarea"), t("seating", "Seating")],
  accommodation_options: [
    t("hotel_name", "Hotel"),
    t("location_name", "Location"),
    t("star", "Stars", "number"),
    t("room", "Room"),
    t("meals", "Meals"),
    t("check_in_date", "Check in", "date"),
    t("check_in_time", "Check-in time", "time"),
    t("check_out_date", "Check out", "date"),
    t("check_out_time", "Check-out time", "time"),
    t("nights", "Nights", "number"),
    t("rooms", "Rooms", "number"),
    { name: "cxl_type", label: "Cancellation", type: "select", options: [["", "Not stated"], ["free", "Free"], ["nonref", "Non-refundable"]] },
    t("cxl", "Free cancellation until"),
    t("address", "Address"),
    t("url", "Website"),
    t("url_label", "Website label"),
    t("geo_url", "Map link"),
  ],
  car_rentals: [
    t("company", "Company"),
    t("vehicle", "Vehicle"),
    t("pickup_location", "Pick-up place"),
    t("pickup_date", "Pick-up date", "date"),
    t("pickup_time", "Pick-up time", "time"),
    t("dropoff_location", "Drop-off place"),
    t("dropoff_date", "Drop-off date", "date"),
    t("dropoff_time", "Drop-off time", "time"),
  ],
  transfers: [
    t("supplier", "Supplier"),
    t("from_place", "From"),
    t("to_place", "To"),
    t("date", "Date", "date"),
    t("time", "Pick-up time", "time"),
    t("vehicle", "Vehicle"),
    t("passengers", "Passengers", "number"),
  ],
  rail_journeys: [
    t("operator", "Operator"),
    t("service", "Service"),
    t("from_station", "From station"),
    t("to_station", "To station"),
    t("date", "Date", "date"),
    t("departs", "Departs", "time"),
    t("arrives", "Arrives", "time"),
    t("travel_class", "Class"),
  ],
  excursions: [
    t("provider_name", "Provider"),
    t("description", "Description", "textarea"),
    t("location", "Location"),
    t("start_date", "Start date", "date"),
    t("start_time", "Start time", "time"),
    t("end_date", "End date", "date"),
    t("end_time", "End time", "time"),
  ],
};

/** Every Item has these (migration 0009). Fee region, variant and the fees are drawn separately. */
export const PRICE_FIELDS: Field[] = [
  t("price", "Price (R)", "number"),
  t("markup", "Markup (R)", "number"),
  t("prepaid", "Prepaid", "checkbox"),
  t("notes", "Notes", "textarea"),
];

export const REGION_OPTIONS: [string, string][] = [
  ["", "Work it out"],
  ["domestic", "Domestic"],
  ["neighbouring", "Neighbouring"],
  ["local_international", "Local international (flights)"],
  ["international", "International"],
];
export const VARIANT_OPTIONS: [string, string][] = [
  ["", "Economy"],
  ["premium", "Business / first"],
  ["side_ticket", "Internal side ticket"],
];
export const FEE_LABELS: [string, string][] = [
  ["transaction_fee", "Transaction fee"],
  ["change_fee", "Change fee"],
  ["refund_fee", "Refund fee"],
  ["prepayment_fee", "Pre-payment fee"],
];

export const FLIGHT_FIELDS: Field[] = [
  t("direction_no", "Dir.", "number"),
  t("direction_label", "Direction"),
  t("seq", "#", "number"),
  t("airline", "Airline"),
  t("flight_no", "Flight"),
  t("operated_by", "Operated by"),
  t("from_code", "From"),
  t("from_city", "From city"),
  t("from_airport", "From airport"),
  t("to_code", "To"),
  t("to_city", "To city"),
  t("to_airport", "To airport"),
  t("date", "Date", "date"),
  t("departs", "Departs", "time"),
  t("arrives", "Arrives", "time"),
  t("next_day", "+1", "checkbox"),
  t("booking_class", "Class"),
  t("cabin", "Cabin"),
  t("fare_basis", "Fare basis"),
  t("baggage", "Baggage"),
  t("flying_time", "Flying time"),
  t("stops", "Stops", "number"),
  t("aircraft", "Aircraft"),
];
