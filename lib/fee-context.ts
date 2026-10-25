import type { SupabaseClient } from "@supabase/supabase-js";
import { one } from "@/lib/relations";
import type { FeeRate, Stay } from "@/lib/fees";
import { placeCodes, placesFrom, type AirportRow, type Place } from "@/lib/codes";

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

/** Airport or city code -> place (lib/codes.ts placesFrom), for the codes given. Unknown codes are left out. */
export async function loadPlaces(supabase: SupabaseClient, codes: unknown[]): Promise<Map<string, Place>> {
  const wanted = placeCodes(codes); // only A-Z codes, so they are safe inside the filter string
  if (wanted.length === 0) return new Map();
  const list = wanted.join(",");
  const { data } = await supabase
    .from("airports")
    .select("iata, name, city, city_code, country_code")
    .or(`iata.in.(${list}),city_code.in.(${list})`);
  return placesFrom((data ?? []) as AirportRow[], wanted);
}

/** Code -> country, the form lib/fees.ts autoRegion takes. */
export function countriesOf(places: Map<string, Place>): Map<string, string | null> {
  return new Map([...places].map(([code, p]) => [code, p.country]));
}
