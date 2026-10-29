-- Fee region follows the Item until the Consultant picks one (GLOSSARY: Fee region).
-- Run in the Supabase SQL editor after 0018.
--
--   * fee_region_auto: true while the region is the one the code worked out, so it is
--     worked out again on every save; false once the Consultant picks one.
--     Existing rows start false: nobody can tell which regions were picked by hand,
--     so none is changed by itself. Empty regions are still worked out on save.

alter table public.flight_options        add column fee_region_auto boolean not null default false;
alter table public.accommodation_options add column fee_region_auto boolean not null default false;
alter table public.car_rentals           add column fee_region_auto boolean not null default false;
alter table public.transfers             add column fee_region_auto boolean not null default false;
alter table public.rail_journeys         add column fee_region_auto boolean not null default false;
alter table public.excursions            add column fee_region_auto boolean not null default false;
