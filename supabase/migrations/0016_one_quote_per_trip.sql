-- One Quote per Trip, kept as its own record (docs/adr/0007).
-- Run in the Supabase SQL editor after 0015.
--
--   * Every Trip has exactly one Quote. It is created with the Trip by a
--     trigger; Trips that have none get one now.
--   * The Quote's own reference, title, owner and expected close date are
--     gone. The Trip's reference is the one staff and PDFs use.
--   * A Trip's terms profile defaults to standard_za_international.
--
-- It STOPS if any Trip has more than one Quote (test data only): delete the
-- extra Quotes first, then run this again.

do $$
begin
  if exists (select 1 from public.quotes group by trip_id having count(*) > 1) then
    raise exception 'Some Trips have more than one Quote. Delete the extra Quotes first, then run this again.';
  end if;
end $$;

-- ------------------------------------------------------------------ quotes
drop trigger quotes_set_ref on public.quotes;
drop function public.set_quote_ref();
delete from public.ref_counters where kind = 'quote';
delete from public.ref_prefixes where kind = 'quote';

alter table public.quotes
  drop column reference,
  drop column title,
  drop column owner_id,
  drop column expected_close_on,
  add constraint quotes_one_per_trip unique (trip_id);
drop index public.quotes_trip_idx;   -- the unique constraint indexes trip_id

insert into public.quotes (trip_id, created_by)
  select t.id, t.created_by from public.trips t
  where not exists (select 1 from public.quotes q where q.trip_id = t.id);

-- Runs as the signed-in user: the insert policy on quotes (can_access_trip)
-- already passes for anyone who could insert the Trip.
create function public.create_trip_quote() returns trigger
language plpgsql as $$
begin
  insert into public.quotes (trip_id, created_by) values (new.id, new.created_by);
  return new;
end $$;
create trigger trips_create_quote after insert on public.trips
  for each row execute function public.create_trip_quote();

-- ------------------------------------------------------------------- trips
update public.trips set terms_profile = 'standard_za_international' where terms_profile is null;
alter table public.trips
  alter column terms_profile set default 'standard_za_international',
  alter column terms_profile set not null;
