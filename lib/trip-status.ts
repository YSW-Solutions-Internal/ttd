// Mirrors the check constraint on trips.status (migration 0022).
export const TRIP_STATUSES = ["enquiry", "quoted", "booked", "travelled", "cancelled"] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

/** The Trips list's default: everything not yet travelled or cancelled. */
export const OPEN_STATUSES: TripStatus[] = ["enquiry", "quoted", "booked"];

export function isTripStatus(v: unknown): v is TripStatus {
  return TRIP_STATUSES.includes(v as TripStatus);
}

export const tripStatusLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
