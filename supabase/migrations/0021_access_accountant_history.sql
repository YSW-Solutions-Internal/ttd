-- Every User sees every Client and Trip; the Accountant role; History (docs/adr/0010).
-- Run in the Supabase SQL editor after 0020.
--
--   * New role 'accountant': sees what every User sees, edits nothing (the accounts
--     records come later), and is never a Client's Consultant.
--   * Every signed-in User reads every Client, Trip, Quote, Item and Version and
--     their stored files. Standard users and Administrators edit them; deletes
--     that were admin-only stay admin-only.
--   * Client documents (rows and files) stay with the Client's Consultant and
--     Administrators (can_access_client, as in 0007).
--   * Only an Administrator hands a Client over: a trigger now does what the
--     clients update policy did.
--   * History: one row per insert, update or delete on business records, with who
--     (empty for the background extraction and cron), when, and before / after.
--     Updates keep only the fields that changed and are skipped when nothing did.
--     Nobody can change or remove a History entry through the API.
--   * replace_flights() updates flights in place instead of deleting and re-adding
--     them all, so History shows what changed rather than every flight twice.

-- -------------------------------------------------------------- the role
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('user', 'admin', 'accountant'));
alter table public.invitations drop constraint invitations_role_check;
alter table public.invitations add constraint invitations_role_check check (role in ('user', 'admin', 'accountant'));

create function public.can_edit() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('user', 'admin'))
$$;
revoke execute on function public.can_edit() from public, anon;
grant execute on function public.can_edit() to authenticated;

-- Replaces the 0006 version: also refuses to make a Client's Consultant an Accountant.
create or replace function public.guard_role_change() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.role is distinct from old.role then
    if current_user in ('authenticated', 'anon') and not public.is_admin() then
      raise exception 'Only an administrator can change a role.'
        using errcode = 'insufficient_privilege';
    end if;

    if new.role = 'accountant' and exists (select 1 from public.clients where consultant_id = new.id) then
      raise exception 'An Accountant cannot be a Consultant. Hand their clients over first.'
        using errcode = 'check_violation';
    end if;

    if old.role = 'admin' then
      perform pg_advisory_xact_lock(hashtext('public.profiles last admin'));
      -- Runs after the lock with a fresh snapshot, so it sees a demotion that just committed.
      if not exists (select 1 from public.profiles where role = 'admin' and id <> old.id) then
        raise exception 'Cannot remove the last administrator.'
          using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end $$;

-- ------------------------------------------------------------ Consultants
create function public.guard_consultant() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = new.consultant_id and role in ('user', 'admin')) then
    raise exception 'A Consultant must be a Standard user or an Administrator.'
      using errcode = 'check_violation';
  end if;
  -- auth.uid() is empty in the SQL editor and for the service key, which are trusted.
  if auth.uid() is not null and not public.is_admin()
     and (tg_op = 'INSERT' and new.consultant_id <> auth.uid()
          or tg_op = 'UPDATE' and new.consultant_id is distinct from old.consultant_id) then
    raise exception 'Only an administrator can hand a client over.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger clients_guard_consultant before insert or update of consultant_id on public.clients
  for each row execute function public.guard_consultant();

-- ---------------------------------------------------------------- policies
-- Every consultant_* policy from 0007 and 0009 except client documents': reading
-- opens to every User, writing needs can_edit(). Renamed staff_* to say so.
do $$
declare p record;
begin
  for p in select tablename, policyname, cmd from pg_policies
            where schemaname = 'public' and policyname like 'consultant\_%' and tablename <> 'client_documents'
  loop
    if p.cmd = 'SELECT' then
      execute format('alter policy %I on public.%I using (true)', p.policyname, p.tablename);
    elsif p.cmd = 'INSERT' then
      execute format('alter policy %I on public.%I with check (public.can_edit())', p.policyname, p.tablename);
    elsif p.cmd = 'DELETE' then
      execute format('alter policy %I on public.%I using (public.can_edit())', p.policyname, p.tablename);
    else
      execute format('alter policy %I on public.%I using (public.can_edit()) with check (public.can_edit())',
                     p.policyname, p.tablename);
    end if;
    if p.cmd = 'ALL' then
      execute format('create policy staff_read on public.%I for select to authenticated using (true)', p.tablename);
    end if;
    execute format('alter policy %I on public.%I rename to %I',
                   p.policyname, p.tablename, replace(p.policyname, 'consultant_', 'staff_'));
  end loop;
end $$;

alter policy staff_read on public.fee_schedules using (true);
alter policy staff_insert on public.destinations with check (public.can_edit());
alter policy staff_write on public.airlines with check (public.can_edit());
alter policy staff_update on public.airlines using (public.can_edit()) with check (public.can_edit());

-- Stored files: Quote files for everyone to read and editors to upload; Client
-- files as before. Overwrite and delete stay admin-only (0006).
create or replace function public.can_access_file(p_bucket text, p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  head text := split_part(p_name, '/', 1);
begin
  if head !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return public.is_admin();
  end if;
  if p_bucket = 'client-files' then return public.can_access_client(head::uuid); end if;
  if p_bucket = 'quote-files' then return public.can_edit(); end if;
  return false;
end $$;
alter policy consultant_files_read on storage.objects
  using (bucket_id = 'quote-files' or bucket_id = 'client-files' and public.can_access_file(bucket_id, name));

-- No policy uses these any more.
drop function public.can_access_image(uuid);
drop function public.can_access_version(uuid);
drop function public.can_access_quote(uuid);
drop function public.can_access_trip(uuid);

-- ---------------------------------------------------------------- flights
-- Same as 0012, but matches flights by (direction_no, seq) and updates them in place.
create or replace function public.replace_flights(p_option_id uuid, p_flights jsonb)
returns void
language plpgsql set search_path = public as $$
begin
  delete from public.flights f
   where f.flight_option_id = p_option_id
     and not exists (select 1 from jsonb_populate_recordset(null::public.flights, p_flights) n
                      where n.direction_no = f.direction_no and n.seq = f.seq);

  update public.flights f
     set (direction_label, fare_basis, airline, flight_no, operated_by, aircraft, from_city, from_airport,
          from_code, to_city, to_airport, to_code, date, departs, arrives, next_day, flying_time, stops,
          baggage, booking_class, cabin)
       = (n.direction_label, n.fare_basis, n.airline, n.flight_no, n.operated_by, n.aircraft, n.from_city,
          n.from_airport, n.from_code, n.to_city, n.to_airport, n.to_code, n.date, n.departs, n.arrives,
          coalesce(n.next_day, false), n.flying_time, n.stops, n.baggage, n.booking_class, n.cabin)
    from jsonb_populate_recordset(null::public.flights, p_flights) n
   where f.flight_option_id = p_option_id and n.direction_no = f.direction_no and n.seq = f.seq;

  insert into public.flights (flight_option_id, direction_no, direction_label, fare_basis, seq, airline,
                              flight_no, operated_by, aircraft, from_city, from_airport, from_code, to_city,
                              to_airport, to_code, date, departs, arrives, next_day, flying_time, stops,
                              baggage, booking_class, cabin)
  select p_option_id, n.direction_no, n.direction_label, n.fare_basis, n.seq, n.airline,
         n.flight_no, n.operated_by, n.aircraft, n.from_city, n.from_airport, n.from_code, n.to_city,
         n.to_airport, n.to_code, n.date, n.departs, n.arrives, coalesce(n.next_day, false), n.flying_time, n.stops,
         n.baggage, n.booking_class, n.cabin
    from jsonb_populate_recordset(null::public.flights, p_flights) n
   where not exists (select 1 from public.flights f
                      where f.flight_option_id = p_option_id and f.direction_no = n.direction_no and f.seq = n.seq);
end $$;

-- ----------------------------------------------------------------- History
create table public.history (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  user_id    uuid,              -- empty: the system (background extraction, cron)
  table_name text not null,
  row_id     text not null,
  action     text not null check (action in ('insert', 'update', 'delete')),
  client_id  uuid,              -- the Client page shows its Client's own entries
  trip_id    uuid,              -- the Trip page shows the Trip's and everything under it
  before     jsonb,             -- update: only the fields that changed; delete: the whole row
  after      jsonb              -- update: only the fields that changed; insert: the whole row
);
create index history_trip on public.history (trip_id, at desc);
create index history_client on public.history (client_id, at desc);

alter table public.history enable row level security;
-- Read-only through the API; only record_history() writes. Client document entries
-- (file names) stay with the Client's Consultant and Administrators.
create policy staff_read on public.history for select to authenticated
  using (table_name <> 'client_documents' or public.can_access_client(client_id));

create function public.record_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  b jsonb;
  a jsonb;
  trip uuid;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, to_jsonb(old) -> k), jsonb_object_agg(k, r -> k)
      into b, a
      from jsonb_object_keys(r) k
     where k <> 'updated_at' and r -> k is distinct from to_jsonb(old) -> k;
    if a is null then return null; end if;
  elsif tg_op = 'INSERT' then
    a := r - 'assembled';   -- a Version's frozen JSON is kept on the Version itself
  else
    b := r - 'assembled';
  end if;

  if tg_table_name = 'trips' then
    trip := (r ->> 'id')::uuid;
  elsif r ? 'trip_id' then
    trip := (r ->> 'trip_id')::uuid;
  elsif r ? 'quote_id' then
    select trip_id into trip from public.quotes where id = (r ->> 'quote_id')::uuid;
  elsif tg_table_name = 'flights' then
    select q.trip_id into trip from public.flight_options o join public.quotes q on q.id = o.quote_id
     where o.id = (r ->> 'flight_option_id')::uuid;
  end if;

  insert into public.history (user_id, table_name, row_id, action, client_id, trip_id, before, after)
  values (auth.uid(), tg_table_name,
          coalesce(r ->> 'id', r ->> 'code', concat_ws('/', r ->> 'schedule_id', r ->> 'kind', r ->> 'fee_region')),
          lower(tg_op),
          case when tg_table_name = 'clients' then (r ->> 'id')::uuid else (r ->> 'client_id')::uuid end,
          trip, b, a);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['clients', 'client_documents', 'trips', 'trip_stops', 'quotes', 'quote_versions',
                           'images', 'item_bookings',
                           'flight_options', 'flights', 'accommodation_options', 'car_rentals', 'transfers',
                           'rail_journeys', 'excursions', 'fee_schedules', 'fee_schedule_lines', 'fee_rates',
                           'destinations', 'profiles'] loop
    execute format('create trigger %I_history after insert or update or delete on public.%I
                      for each row execute function public.record_history()', t, t);
  end loop;
end $$;
