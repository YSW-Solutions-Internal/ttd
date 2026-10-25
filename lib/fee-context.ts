import type { SupabaseClient } from "@supabase/supabase-js";
import { one } from "@/lib/relations";
import type { FeeRate, Stay } from "@/lib/fees";

export type FeeContext = { createdOn: string; stays: Stay[]; rates: FeeRate[] };

/**
 * What lib/fees.ts needs for one Quote: the day it was created (for filling in
 * years), its Trip's Stays with their countries, and the fee grid of the Client's
 * own Fee schedule, or the standard one when the Client has none.
 */
export async function loadFeeContext(supabase: SupabaseClient, quoteId: string): Promise<FeeContext> {
  const { data: quote, error } = await supabase
    .from("quotes")
    .select("created_at, trips(id, client_id)")
    .eq("id", quoteId)
    .single();
  if (error || !quote) throw new Error(`Could not load the quote: ${error?.message ?? "not found"}`);
  const trip = one(quote.trips) as { id: string; client_id: string } | null;

  const [{ data: stops }, { data: schedules }] = await Promise.all([
    supabase
      .from("trip_stops")
      .select("id, starts_on, ends_on, destinations(country_code)")
      .eq("trip_id", trip?.id ?? "")
      .order("position"),
    supabase
      .from("fee_schedules")
      .select("id, client_id")
      .or(`client_id.is.null,client_id.eq.${trip?.client_id ?? "00000000-0000-0000-0000-000000000000"}`),
  ]);
  const schedule = schedules?.find((s) => s.client_id) ?? schedules?.find((s) => !s.client_id);
  const { data: rates } = schedule
    ? await supabase
        .from("fee_rates")
        .select("kind, fee_region, variant, transaction_fee, change_fee, refund_fee, prepayment_fee")
        .eq("schedule_id", schedule.id)
    : { data: [] };

  return {
    createdOn: String(quote.created_at).slice(0, 10),
    stays: (stops ?? []).map((s) => ({
      id: s.id,
      starts_on: s.starts_on,
      ends_on: s.ends_on,
      country_code: (one(s.destinations) as { country_code: string } | null)?.country_code ?? null,
    })),
    rates: (rates ?? []) as FeeRate[],
  };
}

/** Upper-case IATA code -> country code, for the codes given. Unknown codes are left out. */
export async function airportCountries(supabase: SupabaseClient, codes: unknown[]): Promise<Map<string, string | null>> {
  const wanted = [...new Set(codes.filter((c): c is string => typeof c === "string" && c.trim() !== "").map((c) => c.trim().toUpperCase()))];
  if (wanted.length === 0) return new Map();
  const { data } = await supabase.from("airports").select("iata, country_code").in("iata", wanted);
  return new Map((data ?? []).map((a) => [a.iata.toUpperCase(), a.country_code]));
}
