-- Any User can add a Destination (GLOSSARY: Destination).
-- Run in the Supabase SQL editor after 0019.
--
--   * Insert for every signed-in User; there is still no update or delete from the app,
--     so a wrong one is fixed here by an Administrator.
--   * created_by / created_at say who added one (empty for the seeded list).
--   * Codes are upper-case letters and digits: IATA city codes, or one made from the
--     name for a place with no airport (SABISAND). NOT VALID: checked for new rows only.

alter table public.destinations
  add column created_by uuid references public.profiles(id) default auth.uid(),
  add column created_at timestamptz default now();

alter table public.destinations
  add constraint destinations_code_format check (code ~ '^[A-Z0-9]{2,12}$') not valid,
  add constraint destinations_country_code_format check (country_code ~ '^[A-Z]{2}$') not valid;

create policy staff_insert on public.destinations for insert to authenticated with check (true);
