-- Package, Visa, Insurance and Extra Items, Trip checklist, Card surcharge, Online saving
-- (GLOSSARY: Package, Visa, Insurance, Extra, Trip checklist, Card surcharge, Online saving).
-- Run in the Supabase SQL editor after 0029.
--
--   * Four new kinds of Item, entered by hand only (image_id stays empty): packages
--     (package), visas (visa, one Traveller each), insurance_policies (insurance, any
--     number of Travellers) and extras (extra, one of seven types). Each has the columns
--     every Item has, the same policies, History and booked-Item lock, and appears in
--     quote_items. A Visa's or policy's Travellers must be on the Item's Trip.
--   * The new kinds also go into the kind lists of item_bookings, item_refs,
--     version_items and ref_prefixes (prefixes PKG, VISA, INS, EXT), so they can be
--     booked and go on a Version.
--   * Card surcharge: card_paid and card_surcharge on every Item; the rate is on the Fee
--     schedule (card_surcharge_rate, 2.75% unless a Client's schedule says otherwise).
--   * Online saving: online_price on Flight options.
--   * fee_rates: Visa R529, Insurance R161 and each Extra type's fee, on every schedule.
--     Package has no rate (the Consultant types its fee). The new kinds' fees are flat:
--     one row each, under 'domestic' as a placeholder.
--   * Trip checklist (trip_checks): six checks per Trip, each done (who, when) with a
--     note. The Trip's Visa, Health and Insurance info move into the notes of the
--     matching checks, and the three trips columns go. The app code that read them is
--     updated in the same branch (feat/new-kinds-pricing).
--   * An Extra with no supplier price is booked with no Supplier, reference or expected
--     supplier-invoice date, amount 0 and No supplier invoice expected. Every function
--     and view reading item_bookings.supplier_id (0024-0029) already treats an empty one
--     as matching no Supplier, so none changes.

-- ------------------------------------------------------------- item tables
-- Dates are text, as in 0009.
create table public.packages (
  operator        text,
  name            text,
  destination     text,
  start_date      text,
  end_date        text,
  deposit         numeric(12, 2) check (deposit >= 0),
  balance_due_on  date
);

create table public.visas (
  country       text,
  visa_type     text,
  traveller_id  uuid references public.travellers(id)
);

create table public.insurance_policies (
  insurer        text,
  policy_type    text,
  start_date     text,
  end_date       text,
  traveller_ids  uuid[] not null default '{}'
);

create table public.extras (
  extra_type        text check (extra_type in ('preseat', 'baggage', 'after_hours', 'meet_greet',
                                               'conference', 'report_mis', 'report_adhoc')),
  description       text,
  flight_entity_id  text,
  seats             text,
  bags              text,
  airport           text,
  date              text,
  time              text,
  people            integer check (people > 0),
  period            text
);

-- The 0009 common columns as 0011 and 0019 left them; policies as 0021 left the others'.
do $$
declare t text;
begin
  foreach t in array array['packages', 'visas', 'insurance_policies', 'extras'] loop
    execute format($f$
      alter table public.%1$I
        add column id               uuid primary key default gen_random_uuid(),
        add column quote_id         uuid not null references public.quotes(id) on delete cascade,
        add column image_id         uuid references public.images(id) on delete cascade,   -- always null: entered by hand
        add column entity_id        text not null,
        add column price            numeric(12, 2),
        add column price_note       text,
        add column fee_region       text check (fee_region in ('domestic', 'neighbouring', 'local_international', 'international')),
        add column fee_region_auto  boolean not null default false,
        add column variant          text not null default '' check (variant in ('', 'premium', 'side_ticket')),
        add column markup           numeric(12, 2) not null default 0,
        add column transaction_fee  numeric(12, 2),
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
    execute format('create policy staff_read on public.%I for select to authenticated using (true)', t);
    execute format('create policy staff_all on public.%I for all to authenticated
                      using (public.can_edit()) with check (public.can_edit())', t);
    execute format('create trigger %I_booked before update or delete on public.%I
                      for each row execute function public.guard_booked_item()', t, t);
    execute format('create trigger %I_history after insert or update or delete on public.%I
                      for each row execute function public.record_history()', t, t);
  end loop;
end $$;
alter table public.extras alter column price set default 0;

-- Same as 0009, plus the four new kinds.
create or replace view public.quote_items with (security_invoker = true) as
select i.quote_id, i.kind, i.entity_id, i.image_id
from (
  select quote_id, 'flight' as kind, entity_id, image_id from public.flight_options
  union all select quote_id, 'hotel',      entity_id, image_id from public.accommodation_options
  union all select quote_id, 'car_rental', entity_id, image_id from public.car_rentals
  union all select quote_id, 'transfer',   entity_id, image_id from public.transfers
  union all select quote_id, 'rail',       entity_id, image_id from public.rail_journeys
  union all select quote_id, 'excursion',  entity_id, image_id from public.excursions
  union all select quote_id, 'package',    entity_id, image_id from public.packages
  union all select quote_id, 'visa',       entity_id, image_id from public.visas
  union all select quote_id, 'insurance',  entity_id, image_id from public.insurance_policies
  union all select quote_id, 'extra',      entity_id, image_id from public.extras
) i
left join public.images img on img.id = i.image_id
where img.removed_at is null;   -- a removed image's Items stay stored (re-adding it brings them back) but leave the Quote

-- The kind lists from 0002.
alter table public.ref_prefixes drop constraint ref_prefixes_kind_check;
alter table public.ref_prefixes add constraint ref_prefixes_kind_check check (kind in (
  'trip', 'quote', 'flight', 'hotel', 'car_rental', 'excursion', 'transfer', 'rail', 'package', 'visa', 'insurance', 'extra'));
insert into public.ref_prefixes (kind, prefix) values ('package', 'PKG'), ('visa', 'VISA'), ('insurance', 'INS'), ('extra', 'EXT');

do $$
declare t text;
begin
  foreach t in array array['item_refs', 'version_items', 'item_bookings'] loop
    execute format('alter table public.%1$I drop constraint %1$s_kind_check', t);
    execute format($f$alter table public.%1$I add constraint %1$s_kind_check check (kind in (
      'flight', 'hotel', 'car_rental', 'excursion', 'transfer', 'rail', 'package', 'visa', 'insurance', 'extra'))$f$, t);
  end loop;
end $$;

-- ------------------------------------------------------ Item Travellers
-- A Visa's Traveller and an Insurance policy's Travellers are on the Item's Trip.
create function public.guard_item_travellers() returns trigger
language plpgsql set search_path = public as $$
declare
  ids uuid[];
begin
  if tg_table_name = 'visas' then
    ids := array_remove(array[new.traveller_id], null);
  else
    ids := new.traveller_ids;
  end if;
  if exists (select 1 from unnest(ids) as v(id)
              where not exists (select 1 from public.trip_travellers tt join public.quotes q on q.trip_id = tt.trip_id
                                 where q.id = new.quote_id and tt.traveller_id = v.id)) then
    raise exception 'That Traveller is not on this Trip.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger visas_travellers before insert or update of traveller_id on public.visas
  for each row execute function public.guard_item_travellers();
create trigger insurance_policies_travellers before insert or update of traveller_ids on public.insurance_policies
  for each row execute function public.guard_item_travellers();

-- -------------------------------------------- Card surcharge, Online saving
do $$
declare t text;
begin
  foreach t in array array['flight_options', 'accommodation_options', 'car_rentals', 'transfers', 'rail_journeys',
                           'excursions', 'packages', 'visas', 'insurance_policies', 'extras'] loop
    execute format('alter table public.%I
                      add column card_paid boolean not null default false,
                      add column card_surcharge numeric(12, 2)', t);
  end loop;
end $$;

alter table public.flight_options add column online_price numeric(12, 2) check (online_price >= 0);

alter table public.fee_schedules
  add column card_surcharge_rate numeric(6, 4) not null default 0.0275 check (card_surcharge_rate >= 0 and card_surcharge_rate < 1);

-- --------------------------------------------------------------- fee_rates
alter table public.fee_rates
  drop constraint fee_rates_kind_check,
  drop constraint fee_rates_variant_check,
  add constraint fee_rates_kind_check check (kind in (
    'flight', 'hotel', 'car_rental', 'excursion', 'transfer', 'rail', 'package', 'visa', 'insurance', 'extra')),
  add constraint fee_rates_variant_check check (variant in (
    '', 'premium', 'side_ticket',
    'preseat', 'baggage', 'after_hours', 'meet_greet', 'conference', 'report_mis', 'report_adhoc'));

-- Flat kinds have one row each; 'domestic' is a placeholder and rateFor ignores the region.
-- Every schedule, so Clients' own schedules have them too.
insert into public.fee_rates (schedule_id, kind, fee_region, variant, transaction_fee, change_fee, refund_fee, prepayment_fee)
select s.id, v.* from public.fee_schedules s cross join (values
  ('visa',      'domestic', '',             529.00, 0.00, 0.00, 0.00),
  ('insurance', 'domestic', '',             161.00, 0.00, 0.00, 0.00),
  ('extra',     'domestic', 'preseat',      287.50, 0.00, 0.00, 0.00),
  ('extra',     'domestic', 'baggage',      287.50, 0.00, 0.00, 0.00),
  ('extra',     'domestic', 'after_hours',  948.75, 0.00, 0.00, 0.00),
  ('extra',     'domestic', 'meet_greet',   189.75, 0.00, 0.00, 0.00),
  ('extra',     'domestic', 'conference',   230.00, 0.00, 0.00, 0.00),
  ('extra',     'domestic', 'report_mis',   747.50, 0.00, 0.00, 0.00),
  ('extra',     'domestic', 'report_adhoc', 569.25, 0.00, 0.00, 0.00)
) as v(kind, fee_region, variant, transaction_fee, change_fee, refund_fee, prepayment_fee);

-- ----------------------------------------------------------- Trip checklist
create table public.trip_checks (
  trip_id    uuid not null references public.trips(id) on delete cascade,
  check_key  text not null check (check_key in ('visa', 'health', 'insurance', 'details', 'seats_meals', 'documents')),
  done_at    timestamptz,   -- empty: not done
  done_by    uuid default auth.uid() references public.profiles(id),
  note       text,
  updated_at timestamptz not null default now(),
  primary key (trip_id, check_key)
);
create trigger trip_checks_updated_at before update on public.trip_checks
  for each row execute function public.set_updated_at();
create trigger trip_checks_history after insert or update or delete on public.trip_checks
  for each row execute function public.record_history();

-- Same rules as trips.
alter table public.trip_checks enable row level security;
create policy staff_read   on public.trip_checks for select to authenticated using (true);
create policy staff_insert on public.trip_checks for insert to authenticated with check (public.can_edit());
create policy staff_update on public.trip_checks for update to authenticated using (public.can_edit()) with check (public.can_edit());
create policy admin_delete on public.trip_checks for delete to authenticated using (public.is_admin());

insert into public.trip_checks (trip_id, check_key, note)
select id, 'visa', visa_info from public.trips where btrim(coalesce(visa_info, '')) <> ''
union all
select id, 'health', health_info from public.trips where btrim(coalesce(health_info, '')) <> ''
union all
select id, 'insurance', insurance_info from public.trips where btrim(coalesce(insurance_info, '')) <> '';

alter table public.trips drop column visa_info, drop column health_info, drop column insurance_info;

-- ---------------------------------------------------- Extras with no Supplier
alter table public.item_bookings
  alter column supplier_id drop not null,
  alter column booking_reference drop not null,
  alter column expected_invoice_on drop not null,
  add constraint item_bookings_supplier check (
    kind = 'extra' and supplier_id is null and booking_reference is null and expected_invoice_on is null
      and amount = 0 and no_supplier_invoice
    or supplier_id is not null and booking_reference is not null and expected_invoice_on is not null);
