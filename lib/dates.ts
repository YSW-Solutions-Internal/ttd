// Dates as the agency sees them: South African time, not the server's UTC.

/** Today in South Africa, YYYY-MM-DD. */
export const todayInSA = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });

/** The month before or after "YYYY-MM". */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}
