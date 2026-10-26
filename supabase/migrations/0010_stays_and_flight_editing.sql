-- TTD quoting app: migration 0010.
-- Run in the Supabase SQL editor after 0009.
--
--   * An Accommodation option can be placed in one of its Trip's Stays (trip_stops).
--   * replace_flights(): the edit screen saves a Flight option's flights as one
--     list, all or nothing, so a failed save never leaves an option half-edited.

alter table public.accommodation_options
  add column stay_id uuid references public.trip_stops(id) on delete set null;

create function public.replace_flights(p_option_id uuid, p_flights jsonb)
returns void
language plpgsql set search_path = public as $$
begin
  delete from public.flights where flight_option_id = p_option_id;
  insert into public.flights (flight_option_id, direction_no, direction_label, fare_basis, seq, airline,
                              flight_no, aircraft, from_city, from_code, to_city, to_code, date, departs,
                              arrives, next_day, flying_time, stops, baggage, cabin)
  select p_option_id, f.direction_no, f.direction_label, f.fare_basis, f.seq, f.airline,
         f.flight_no, f.aircraft, f.from_city, f.from_code, f.to_city, f.to_code, f.date, f.departs,
         f.arrives, coalesce(f.next_day, false), f.flying_time, f.stops, f.baggage, f.cabin
    from jsonb_populate_recordset(null::public.flights, p_flights) f;
end $$;
revoke execute on function public.replace_flights(uuid, jsonb) from public, anon;
grant execute on function public.replace_flights(uuid, jsonb) to authenticated;
