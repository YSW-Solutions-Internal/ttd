-- Booking Items with Suppliers, Corrections, Changes and Cancellations (GLOSSARY, ADR 0011).
-- Run in the Supabase SQL editor after 0022.
--
--   * suppliers: one shared list; any User adds, only Administrators correct or remove.
--   * item_bookings (0002, unused until now) becomes the booking: a row means the Item
--     is booked. It names the Supplier, the booking reference, the Supplier's currency,
--     amount and rate (1 for Rand) and the date the Supplier invoice is expected.
--     The status column goes: Issued is issued_at, Cancelled comes from a Cancellation.
--     Fails on purpose if item_bookings already has rows (nothing in the app wrote any).
--   * item_changes: Changes and Cancellations against a booking. A Cancellation is the
--     last one. A booking with Changes cannot be unbooked.
--   * Booked Items (and a booked Flight option's flights) are edited only by
--     Administrators, and never deleted directly; an image with a booked Item cannot be
--     removed. Cascades (a Stay deleted, an admin deleting a Trip) still go through.

-- --------------------------------------------------------------- suppliers
create table public.suppliers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (btrim(name) <> ''),
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index suppliers_name on public.suppliers (lower(btrim(name)));

alter table public.suppliers enable row level security;
create policy staff_read   on public.suppliers for select to authenticated using (true);
create policy staff_insert on public.suppliers for insert to authenticated with check (public.can_edit());
create policy admin_update on public.suppliers for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_delete on public.suppliers for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------- bookings
alter table public.item_bookings
  drop column status,
  drop column booking_method,
  drop column payment_method,
  add column supplier_id         uuid not null references public.suppliers(id),
  add column currency            text not null default 'ZAR' check (currency ~ '^[A-Z]{3}$'),
  add column amount              numeric(12, 2) not null check (amount >= 0),
  add column rate                numeric(14, 6) not null default 1 check (rate > 0),
  add column expected_invoice_on date not null,
  add column issued_at           timestamptz,
  alter column booking_reference set not null,
  alter column booked_by set default auth.uid(),
  alter column booked_at set default now(),
  alter column booked_at set not null,
  add constraint item_bookings_rand_rate check (currency <> 'ZAR' or rate = 1),
  add constraint item_bookings_reference check (btrim(booking_reference) <> '');

-- ----------------------------------------------------------------- changes
create table public.item_changes (
  id                  uuid primary key default gen_random_uuid(),
  quote_id            uuid not null,
  entity_id           text not null,
  kind                text not null check (kind in ('change', 'cancellation')),
  happened_on         date not null default current_date,
  description         text,
  -- The Supplier's side, in its currency at that day's rate.
  currency            text not null default 'ZAR' check (currency ~ '^[A-Z]{3}$'),
  rate                numeric(14, 6) not null default 1 check (rate > 0),
  extra_fare          numeric(12, 2) not null default 0,
  extra_taxes         numeric(12, 2) not null default 0,
  supplier_penalty    numeric(12, 2) not null default 0,
  -- The agency's side, in Rand: the Change fee, or a Cancellation's Transaction or Refund fee.
  agency_fee          numeric(12, 2) not null default 0,
  markup              numeric(12, 2) not null default 0,
  expected_refund     numeric(12, 2),
  expected_invoice_on date,
  created_by          uuid default auth.uid() references public.profiles(id),
  created_at          timestamptz not null default now(),
  -- Unbooking is refused while a Change exists.
  foreign key (quote_id, entity_id) references public.item_bookings (quote_id, entity_id) on delete restrict,
  constraint item_changes_rand_rate check (currency <> 'ZAR' or rate = 1),
  constraint item_changes_cancellation check (
    kind = 'change' and expected_refund is null
    or kind = 'cancellation' and extra_fare = 0 and extra_taxes = 0 and markup = 0 and coalesce(expected_refund, -1) >= 0),
  constraint item_changes_expected_invoice check (
    expected_invoice_on is not null or extra_fare = 0 and extra_taxes = 0 and supplier_penalty = 0)
);
create index item_changes_item on public.item_changes (quote_id, entity_id, happened_on);
create unique index item_changes_one_cancellation on public.item_changes (quote_id, entity_id) where kind = 'cancellation';

alter table public.item_changes enable row level security;
create policy staff_read   on public.item_changes for select to authenticated using (true);
create policy staff_insert on public.item_changes for insert to authenticated with check (public.can_edit());
-- Updates are Corrections of what was typed; History keeps what it was.
create policy staff_update on public.item_changes for update to authenticated using (public.can_edit()) with check (public.can_edit());
create policy admin_delete on public.item_changes for delete to authenticated using (public.is_admin());

-- A Cancellation is the Item's last Change.
create function public.guard_change_after_cancellation() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.item_changes
              where quote_id = new.quote_id and entity_id = new.entity_id and kind = 'cancellation') then
    raise exception 'This Item is cancelled; it can have no further Changes.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger item_changes_after_cancellation before insert on public.item_changes
  for each row execute function public.guard_change_after_cancellation();

-- ------------------------------------------------------------- the lock
-- Booked Items: Administrators correct them; nobody deletes one directly (unbook first).
-- pg_trigger_depth() > 1 is a cascade from a parent row, which is let through.
create function public.guard_booked_item() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
  q uuid;
  e text;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  if pg_trigger_depth() > 1 or auth.uid() is null then return r; end if;
  if tg_table_name = 'flights' then
    select o.quote_id, o.entity_id into q, e from public.flight_options o where o.id = r.flight_option_id;
  else
    q := old.quote_id; e := old.entity_id;
  end if;
  if exists (select 1 from public.item_bookings where quote_id = q and entity_id = e) then
    if tg_op = 'DELETE' and tg_table_name <> 'flights' then
      raise exception 'This Item is booked. Unbook it before deleting it.' using errcode = 'insufficient_privilege';
    elsif not public.is_admin() then
      raise exception 'This Item is booked; only an administrator can correct it.' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return r;
end $$;

do $$
declare t text;
begin
  foreach t in array array['flight_options', 'accommodation_options', 'car_rentals', 'transfers',
                           'rail_journeys', 'excursions'] loop
    execute format('create trigger %I_booked before update or delete on public.%I
                      for each row execute function public.guard_booked_item()', t, t);
  end loop;
end $$;
create trigger flights_booked before insert or update or delete on public.flights
  for each row execute function public.guard_booked_item();

-- A removed image takes its Items off the Quote, so not while one of them is booked.
create function public.guard_booked_image() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.removed_at is not null and old.removed_at is null and exists (
       select 1 from public.quote_items i join public.item_bookings b using (quote_id, entity_id)
        where i.image_id = new.id) then
    raise exception 'An Item from this image is booked, so the image cannot be removed.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger images_booked before update of removed_at on public.images
  for each row execute function public.guard_booked_image();

-- ----------------------------------------------------------------- History
do $$
declare t text;
begin
  foreach t in array array['suppliers', 'item_changes'] loop
    execute format('create trigger %I_history after insert or update or delete on public.%I
                      for each row execute function public.record_history()', t, t);
  end loop;
end $$;
