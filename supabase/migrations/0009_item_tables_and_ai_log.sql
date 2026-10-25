-- TTD quoting app: migration 0009. Items as flat rows, AI output as a log (docs/adr/0005).
-- Run in the Supabase SQL editor after 0008.
--
--   * ai_calls: one row per call to Claude, never updated. For developers.
--   * extractions: one row per image, only "has it been read" and the lock.
--     Its result blob goes; existing rows are TEST DATA and are wiped, so
--     every image reads as "Not extracted" and is read again.
--   * One table per kind of Item (flight_options + flights, accommodation_options,
--     car_rentals, transfers, rail_journeys, excursions). Consultants edit
--     these rows directly. Hand-entered Items are rows with no image.
--   * overrides and manual_items are dropped.
--   * quote_items: every Item of a Quote in one list (kind, entity_id, image),
--     leaving out Items whose image was removed.
--   * store_extraction(): writes one image's Items and marks it read, all or nothing.

-- ------------------------------------------------------------- AI call log
create table public.ai_calls (
  id              uuid primary key default gen_random_uuid(),
  image_id        uuid not null references public.images(id) on delete cascade,
  prompt_version  text not null,
  model           text not null,
  started_at      timestamptz not null,
  finished_at     timestamptz not null default now(),
  stop_reason     text,
  input_tokens    int,
  output_tokens   int,
  raw_output      text,             -- Claude's answer exactly as returned, even if it would not parse
  error           text
);
create index ai_calls_image on public.ai_calls (image_id, finished_at desc);

alter table public.ai_calls enable row level security;
create policy consultant_read on public.ai_calls for select to authenticated
  using (public.can_access_image(image_id));
create policy consultant_insert on public.ai_calls for insert to authenticated
  with check (public.can_access_image(image_id));

-- ------------------------------------------------------------- extractions
delete from public.extractions;   -- test data only
alter table public.extractions drop column result;
alter table public.extractions drop constraint extractions_image_id_prompt_version_key;
alter table public.extractions add constraint extractions_image_id_key unique (image_id);
comment on column public.extractions.prompt_version is 'The prompt version that read (or is reading) the image.';

-- Same as 0006, but one row per image: a finished image is never claimed again.
create or replace function public.claim_extraction(p_image_id uuid, p_prompt_version text, p_model text)
returns boolean
language sql as $$
  insert into public.extractions as e (image_id, prompt_version, status, model, started_at)
  values (p_image_id, p_prompt_version, 'running', p_model, now())
  on conflict (image_id) do update
    set status = 'running', error = null, prompt_version = excluded.prompt_version,
        model = excluded.model, started_at = now()
    where e.status in ('pending', 'failed')
       or (e.status = 'running' and (e.started_at is null or e.started_at < now() - interval '10 minutes'))
  returning true
$$;

-- ------------------------------------------------------------- item tables
drop table public.overrides;
drop table public.manual_items;

-- Dates are text: "YYYY-MM-DD", or "--MM-DD" when the image printed no year.
create table public.flight_options (
  label       text,
  fare_rules  text,
  seating     text
);

create table public.accommodation_options (
  location_name   text,
  hotel_name      text,
  star            numeric(2, 1),
  room            text,
  meals           text,
  check_in_date   text,
  check_in_time   text,
  check_out_date  text,
  check_out_time  text,
  nights          int,
  rooms           int not null default 1,   -- the hotel Transaction fee is per room
  cxl_type        text check (cxl_type in ('free', 'nonref')),
  cxl             text,
  address         text,
  geo_url         text,
  url             text,
  url_label       text
);

create table public.car_rentals (
  company           text,
  vehicle           text,
  pickup_location   text,
  dropoff_location  text,
  pickup_date       text,
  pickup_time       text,
  dropoff_date      text,
  dropoff_time      text,
  ten_percent_fee   boolean not null default false   -- Consultant accepted the suggested 10% pre-payment fee
);

create table public.transfers (
  supplier    text,
  from_place  text,
  to_place    text,
  date        text,
  time        text,
  vehicle     text,
  passengers  int
);

create table public.rail_journeys (
  operator      text,
  service       text,
  from_station  text,
  to_station    text,
  date          text,
  departs       text,
  arrives       text,
  travel_class  text
);

create table public.excursions (
  provider_name  text,
  description    text,
  location       text,
  start_date     text,
  start_time     text,
  end_date       text,
  end_time       text
);

-- The columns every Item has, added to each table above.
do $$
declare t text;
begin
  foreach t in array array['flight_options', 'accommodation_options', 'car_rentals',
                           'transfers', 'rail_journeys', 'excursions'] loop
    execute format($f$
      alter table public.%1$I
        add column id               uuid primary key default gen_random_uuid(),
        add column quote_id         uuid not null references public.quotes(id) on delete cascade,
        add column image_id         uuid references public.images(id) on delete cascade,   -- null: entered by hand
        add column entity_id        text not null,   -- what item_refs, version_items and item_bookings point at
        add column currency         text,
        add column price            numeric(12, 2),  -- in currency; null until someone fills it in
        add column price_text       text,            -- the price exactly as printed on the image
        add column price_note       text,            -- why code doubts the price, e.g. worked out from per-person prices
        add column fee_region       text check (fee_region in ('domestic', 'neighbouring', 'local_international', 'international')),
        add column variant          text not null default '' check (variant in ('', 'premium', 'side_ticket')),
        add column markup           numeric(12, 2) not null default 0,
        add column transaction_fee  numeric(12, 2),  -- null until looked up in fee_rates
        add column change_fee       numeric(12, 2),
        add column refund_fee       numeric(12, 2),
        add column prepayment_fee   numeric(12, 2),
        add column prepaid          boolean not null default false,
        add column notes            text,
        add column created_at       timestamptz not null default now(),
        add column updated_at       timestamptz not null default now(),
        add constraint %1$s_entity unique (quote_id, entity_id)$f$, t);
    execute format('create index %1$s_quote on public.%1$I (quote_id)', t);
    execute format('create trigger %1$s_updated_at before update on public.%1$I
                      for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy consultant_all on public.%I for all to authenticated
                      using (public.can_access_quote(quote_id)) with check (public.can_access_quote(quote_id))', t);
  end loop;
end $$;

-- One row per flight, in order within its Direction.
create table public.flights (
  id                uuid primary key default gen_random_uuid(),
  flight_option_id  uuid not null references public.flight_options(id) on delete cascade,
  direction_no      int not null,     -- 1 outbound, 2 return, ... in the order shown
  direction_label   text,
  fare_basis        text,             -- printed per Direction; repeated on each of its flights
  seq               int not null,     -- order within the Direction
  airline           text,
  flight_no         text,
  aircraft          text,
  from_city         text,
  from_code         text,
  to_city           text,
  to_code           text,
  date              text,
  departs           text,
  arrives           text,
  next_day          boolean not null default false,
  flying_time       text,
  stops             int,
  baggage           text,
  cabin             text,
  unique (flight_option_id, direction_no, seq) deferrable initially deferred   -- lets the edit screen reorder
);
alter table public.flights enable row level security;
create policy consultant_all on public.flights for all to authenticated
  using (public.can_access_quote((select quote_id from public.flight_options o where o.id = flight_option_id)))
  with check (public.can_access_quote((select quote_id from public.flight_options o where o.id = flight_option_id)));

-- ------------------------------------------------------- all Items of a Quote
create view public.quote_items with (security_invoker = true) as
select i.quote_id, i.kind, i.entity_id, i.image_id
from (
  select quote_id, 'flight' as kind, entity_id, image_id from public.flight_options
  union all select quote_id, 'hotel',      entity_id, image_id from public.accommodation_options
  union all select quote_id, 'car_rental', entity_id, image_id from public.car_rentals
  union all select quote_id, 'transfer',   entity_id, image_id from public.transfers
  union all select quote_id, 'rail',       entity_id, image_id from public.rail_journeys
  union all select quote_id, 'excursion',  entity_id, image_id from public.excursions
) i
left join public.images img on img.id = i.image_id
where img.removed_at is null;   -- a removed image's Items stay stored (re-adding it brings them back) but leave the Quote

-- ------------------------------------------------- store one image's reading
-- p_rows is {"flight_options": [...], "flights": [...], "accommodation_options": [...], ...}:
-- each array holds rows whose keys are column names, every row of a table with the
-- same keys. Runs as the caller, so the policies above still apply.
create function public.store_extraction(p_image_id uuid, p_source_type text, p_rows jsonb)
returns void
language plpgsql set search_path = public as $$
declare
  t text;
  cols text;
begin
  foreach t in array array['flight_options', 'flights', 'accommodation_options', 'car_rentals',
                           'transfers', 'rail_journeys', 'excursions'] loop
    continue when coalesce(jsonb_array_length(p_rows -> t), 0) = 0;
    select string_agg(quote_ident(k), ', ') into cols from jsonb_object_keys(p_rows -> t -> 0) k;
    execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1)',
                   t, cols, cols, t)
      using p_rows -> t;
  end loop;

  update public.extractions
     set status = 'done', image_type = p_source_type, error = null
   where image_id = p_image_id;
end $$;
revoke execute on function public.store_extraction(uuid, text, jsonb) from public, anon;
grant execute on function public.store_extraction(uuid, text, jsonb) to authenticated;
