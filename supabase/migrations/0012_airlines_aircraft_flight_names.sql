-- TTD quoting app: migration 0012.
-- Run in the Supabase SQL editor after 0011, then run 0013 (the generated seed).
--
--   * airlines: IATA code -> name. Seeded unconfirmed from OpenFlights (0013), which is
--     out of date in places; a Consultant confirms or corrects each code once, from the
--     edit screen, and only confirmed names reach a Client's PDF.
--   * aircraft: IATA equipment code (77W) -> name (Boeing 777-300ER).
--   * flights get the airport name next to the city, the booking class letter (cabin
--     keeps the cabin in words), and the operating carrier for codeshares.

create table public.airlines (
  iata          text primary key,
  name          text not null,
  confirmed     boolean not null default false,
  confirmed_by  uuid references public.profiles(id),
  updated_at    timestamptz not null default now()
);

create table public.aircraft (
  iata  text primary key,
  name  text not null
);

alter table public.airlines enable row level security;
alter table public.aircraft enable row level security;
create policy staff_read on public.airlines for select to authenticated using (true);
-- Any Consultant may confirm or add a name; that is the point of the confirm step.
create policy staff_write on public.airlines for insert to authenticated with check (true);
create policy staff_update on public.airlines for update to authenticated using (true) with check (true);
create policy staff_read on public.aircraft for select to authenticated using (true);
create policy admin_write on public.aircraft for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.flights
  add column from_airport  text,
  add column to_airport    text,
  add column booking_class text,
  add column operated_by   text;

-- Same as 0010, with the new columns.
create or replace function public.replace_flights(p_option_id uuid, p_flights jsonb)
returns void
language plpgsql set search_path = public as $$
begin
  delete from public.flights where flight_option_id = p_option_id;
  insert into public.flights (flight_option_id, direction_no, direction_label, fare_basis, seq, airline,
                              flight_no, operated_by, aircraft, from_city, from_airport, from_code, to_city,
                              to_airport, to_code, date, departs, arrives, next_day, flying_time, stops,
                              baggage, booking_class, cabin)
  select p_option_id, f.direction_no, f.direction_label, f.fare_basis, f.seq, f.airline,
         f.flight_no, f.operated_by, f.aircraft, f.from_city, f.from_airport, f.from_code, f.to_city,
         f.to_airport, f.to_code, f.date, f.departs, f.arrives, coalesce(f.next_day, false), f.flying_time, f.stops,
         f.baggage, f.booking_class, f.cabin
    from jsonb_populate_recordset(null::public.flights, p_flights) f;
end $$;
