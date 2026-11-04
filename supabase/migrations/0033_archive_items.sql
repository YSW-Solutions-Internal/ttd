-- Items are archived, never deleted (README milestone 16).
-- Run in the Supabase SQL editor after 0032.
--
--   * archived_at / archived_by on every Item table. An archived Item leaves the Working
--     content (quote_items, so Generate version and the Trip page) and is restored exactly
--     as it was. archived_by is always the signed-in user, set here, never by the app.
--   * No deletes on Item tables through the API, by anyone. A flight inside a Flight option
--     is still deleted (it is part of an Item; History keeps it).
--   * A booked Item cannot be archived (unbook it first), and an archived one cannot be booked.
--   * Removing an image archives its Items; uploading it again restores the ones that
--     removal archived (same timestamp), not those archived by hand before. Removing is
--     still refused while one of its Items is booked (0023).
--   * The image purge no longer takes Items with it: their image_id is cleared instead.
--   * Items of images already removed are archived now, so they are not lost at the purge.

create function public.guard_archive_item() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.archived_at is not distinct from old.archived_at then return new; end if;
  if new.archived_at is not null
     and exists (select 1 from public.item_bookings where quote_id = new.quote_id and entity_id = new.entity_id) then
    raise exception 'This Item is booked. Unbook it before archiving it.' using errcode = 'check_violation';
  end if;
  new.archived_by := case when new.archived_at is null then null else auth.uid() end;
  return new;
end $$;

do $$
declare
  t text;
  p record;
  c record;
begin
  foreach t in array array['flight_options', 'accommodation_options', 'car_rentals', 'transfers', 'rail_journeys',
                           'excursions', 'packages', 'visas', 'insurance_policies', 'extras'] loop
    execute format('alter table public.%I add column archived_at timestamptz,
                      add column archived_by uuid references public.profiles(id)', t);

    -- staff_read (select) stays; the "all" policy becomes insert and update only.
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t and cmd in ('ALL', 'DELETE') loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('create policy staff_insert on public.%I for insert to authenticated with check (public.can_edit())', t);
    execute format('create policy staff_update on public.%I for update to authenticated
                      using (public.can_edit()) with check (public.can_edit())', t);

    for c in select conname from pg_constraint
              where conrelid = format('public.%I', t)::regclass and confrelid = 'public.images'::regclass and contype = 'f' loop
      execute format('alter table public.%I drop constraint %I', t, c.conname);
      execute format('alter table public.%I add constraint %I foreign key (image_id)
                        references public.images(id) on delete set null', t, c.conname);
    end loop;

    execute format('create trigger %I_archive before update of archived_at on public.%I
                      for each row execute function public.guard_archive_item()', t, t);

    -- Images already removed: archived as if removed today, with the removal's timestamp.
    execute format('update public.%I i set archived_at = img.removed_at from public.images img
                     where img.id = i.image_id and img.removed_at is not null and i.archived_at is null', t);
  end loop;
end $$;

-- Was: Items of removed images left out. Those are now archived, so a restored one comes back.
create or replace view public.quote_items with (security_invoker = true) as
select quote_id, kind, entity_id, image_id
from (
  select quote_id, 'flight' as kind, entity_id, image_id, archived_at from public.flight_options
  union all select quote_id, 'hotel',      entity_id, image_id, archived_at from public.accommodation_options
  union all select quote_id, 'car_rental', entity_id, image_id, archived_at from public.car_rentals
  union all select quote_id, 'transfer',   entity_id, image_id, archived_at from public.transfers
  union all select quote_id, 'rail',       entity_id, image_id, archived_at from public.rail_journeys
  union all select quote_id, 'excursion',  entity_id, image_id, archived_at from public.excursions
  union all select quote_id, 'package',    entity_id, image_id, archived_at from public.packages
  union all select quote_id, 'visa',       entity_id, image_id, archived_at from public.visas
  union all select quote_id, 'insurance',  entity_id, image_id, archived_at from public.insurance_policies
  union all select quote_id, 'extra',      entity_id, image_id, archived_at from public.extras
) i
where archived_at is null;

-- Removing an image archives its Items; bringing it back restores those, and only those.
create function public.archive_image_items() returns trigger
language plpgsql set search_path = public as $$
declare t text;
begin
  foreach t in array array['flight_options', 'accommodation_options', 'car_rentals', 'transfers', 'rail_journeys',
                           'excursions', 'packages', 'visas', 'insurance_policies', 'extras'] loop
    if new.removed_at is not null and old.removed_at is null then
      execute format('update public.%I set archived_at = $1 where image_id = $2 and archived_at is null', t)
        using new.removed_at, new.id;
    elsif new.removed_at is null and old.removed_at is not null then
      execute format('update public.%I set archived_at = null where image_id = $1 and archived_at = $2', t)
        using new.id, old.removed_at;
    end if;
  end loop;
  return new;
end $$;
create trigger images_archive_items after update of removed_at on public.images
  for each row execute function public.archive_image_items();

-- An archived Item is off the Quote, so it cannot be booked.
create function public.guard_book_archived() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.quote_items where quote_id = new.quote_id and entity_id = new.entity_id) then
    raise exception 'This Item is archived. Restore it before booking it.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger item_bookings_archived before insert on public.item_bookings
  for each row execute function public.guard_book_archived();
