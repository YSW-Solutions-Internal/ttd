// Mirrors the check constraint on trips.status (migration 0002).
export const TRIP_STATUSES = ["in_progress", "completed", "cancelled"] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export function isTripStatus(v: unknown): v is TripStatus {
  return TRIP_STATUSES.includes(v as TripStatus);
}

export const tripStatusLabel = (s: string) => s.replace("_", " ");
