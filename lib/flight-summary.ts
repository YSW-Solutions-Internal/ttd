// What the Flights table shows for one Flight option, worked out from its flights.

type Row = Record<string, unknown>;

export type FlightSummary = {
  /** Where the first direction ends, e.g. "Cape Town". */
  destination: string | null;
  /** First and last flight dates (yyyy-mm-dd), or null while no flight has a date. */
  from: string | null;
  to: string | null;
  /** Nights between arriving at the destination and the next direction leaving; null for a one-way option. */
  nights: number | null;
  /** Airline codes in flight order, without repeats. */
  airlines: string[];
};

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const dayNumber = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86_400_000;

/** `flights` are one option's flights, in any order. */
export function summariseFlights(flights: Row[]): FlightSummary {
  const sorted = [...flights].sort((a, b) => Number(a.direction_no) - Number(b.direction_no) || Number(a.seq) - Number(b.seq));
  const firstDir = sorted.length > 0 ? sorted[0].direction_no : null;
  const out = sorted.filter((f) => f.direction_no === firstDir);
  const back = sorted.filter((f) => f.direction_no !== firstDir);

  const last = out[out.length - 1];
  const destination = last ? text(last.to_city) || text(last.to_code) || text(last.to_airport) || null : null;

  const dates = sorted
    .map((f) => f.date)
    .filter(isDate)
    .sort();

  // Arrival can be the next day (red-eye), which moves the first night.
  let nights: number | null = null;
  const arrives = last && isDate(last.date) ? dayNumber(last.date) + (last.next_day === true ? 1 : 0) : null;
  const leaves = back.length > 0 && isDate(back[0].date) ? dayNumber(back[0].date) : null;
  if (arrives !== null && leaves !== null && leaves >= arrives) nights = leaves - arrives;

  const airlines = [...new Set(sorted.map((f) => text(f.airline).toUpperCase()).filter(Boolean))];

  return { destination, from: dates[0] ?? null, to: dates.length > 1 ? dates[dates.length - 1] : null, nights, airlines };
}
