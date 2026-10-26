-- TTD quoting app: migration 0011.
-- Run in the Supabase SQL editor after 0010.
--
-- Every price is in Rand, so Items no longer carry a currency, and the extraction
-- no longer copies the price as printed (it made the schema too large for the API).
do $$
declare t text;
begin
  foreach t in array array['flight_options', 'accommodation_options', 'car_rentals',
                           'transfers', 'rail_journeys', 'excursions'] loop
    execute format('alter table public.%I drop column currency, drop column price_text', t);
  end loop;
end $$;
