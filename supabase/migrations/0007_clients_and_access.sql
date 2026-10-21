-- Clients get a Consultant, and access follows it (docs/adr/0001).
-- Run in the Supabase SQL editor after 0006.
--
--   * Clients have a first and last name. full_name is now calculated from them.
--   * client_no becomes client_code: first letter of the first name, first three
--     letters of the last name, two digits (Ron Wolovitz -> RWOL01). Accents are
--     converted, spaces and punctuation skipped. Set once, never changes, never
--     reused. 99 per prefix.
--   * Every client has one Consultant. A standard user only sees and works on
--     their own clients and everything under them (documents, trips, quotes,
--     images, extractions, versions, items, stored files, the client's fee
--     schedules). Admins see everything and are the only ones who can hand a
--     client to another Consultant.
--   * trips.consultant_id defaults to the client's Consultant. It and
--     quotes.owner_id are labels only: they grant no access.
--   * start_quote() is dropped. Trips and quotes are created separately now.
--
-- It STOPS if public.clients has rows: old codes cannot be converted. Clear the
-- test data first (in this order):
--   delete from public.quotes; delete from public.trips; delete from public.clients;
-- Files already uploaded stay in Storage; remove them in the dashboard if you like.

do $$
begin
  if exists (select 1 from public.clients) then
    raise exception 'public.clients still has rows. Client codes are changing format and cannot be converted. Delete the test data first: delete from public.quotes; delete from public.trips; delete from public.clients; then run this again.';
  end if;
end $$;

create extension if not exists unaccent with schema extensions;

-- ----------------------------------------------------------------- clients
drop trigger clients_set_no on public.clients;
drop function public.set_client_no();
drop function public.client_initials(text);
delete from public.client_code_counters;   -- old RW001-style prefixes

alter table public.clients rename column client_no to client_code;
alter table public.clients drop column full_name;
alter table public.clients
  add column first_name    text not null check (btrim(first_name) <> ''),
  add column last_name     text not null check (btrim(last_name) <> ''),
  add column full_name     text generated always as (first_name || ' ' || last_name) stored,
  add column consultant_id uuid not null default auth.uid() references public.profiles(id),
  add constraint clients_code_format check (client_code ~ '^[A-Z]{1,4}[0-9]{2}$');
create index clients_consultant_idx on public.clients(consultant_id);

-- "Zoë van der Merwe" -> ZVAN. Letters only, accents converted to plain letters.
create function public.client_code_prefix(p_first text, p_last text) returns text
language sql stable set search_path = public, extensions as $$
  select upper(
    left(regexp_replace(unaccent(coalesce(p_first, '')), '[^A-Za-z]', '', 'g'), 1) ||
    left(regexp_replace(unaccent(coalesce(p_last, '')), '[^A-Za-z]', '', 'g'), 3))
$$;

-- Always generated; anything the caller supplies is ignored. The counter only
-- goes up, so a code is never reused even after a client is deleted.
create function public.set_client_code() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p text := public.client_code_prefix(new.first_name, new.last_name);
  n int;
begin
  if p = '' then
    raise exception 'The name must contain letters (A to Z) to make a client code.';
  end if;
  insert into public.client_code_counters (prefix, last_no) values (p, 1)
    on conflict (prefix) do update set last_no = client_code_counters.last_no + 1
    returning last_no into n;
  if n > 99 then
    raise exception 'All 99 client codes starting with % are used.', p;
  end if;
  new.client_code := p || lpad(n::text, 2, '0');
  return new;
end $$;
create trigger clients_set_code before insert on public.clients
  for each row execute function public.set_client_code();

create function public.protect_client_code() returns trigger
language plpgsql as $$
begin
  if new.client_code is distinct from old.client_code then
    raise exception 'A client code never changes.';
  end if;
  return new;
end $$;
create trigger clients_protect_code before update on public.clients
  for each row execute function public.protect_client_code();

-- References use the new column name.
create or replace function public.next_ref(p_client_id uuid, p_kind text) returns text
language plpgsql security definer set search_path = public as $$
declare
  pre text;
  cc text;
  n int;
begin
  select prefix into pre from public.ref_prefixes where kind = p_kind;
  if pre is null then
    raise exception 'No reference prefix is set for "%"', p_kind;
  end if;
  select client_code into cc from public.clients where id = p_client_id;
  if cc is null then
    raise exception 'Unknown client %', p_client_id;
  end if;
  insert into public.ref_counters (client_id, kind, last_no) values (p_client_id, p_kind, 1)
    on conflict (client_id, kind) do update set last_no = ref_counters.last_no + 1
    returning last_no into n;
  return pre || '-' || cc || '-' || lpad(n::text, 3, '0');
end $$;

-- ------------------------------------------------------------------- trips
create or replace function public.set_trip_ref() returns trigger
language plpgsql as $$
begin
  if new.reference is null or btrim(new.reference) = '' then
    new.reference := public.next_ref(new.client_id, 'trip');
  end if;
  if new.consultant_id is null then
    select consultant_id into new.consultant_id from public.clients where id = new.client_id;
  end if;
  return new;
end $$;

drop function public.start_quote(uuid, text, text);

-- ------------------------------------------------------------ access checks
-- SECURITY DEFINER so policies can look up the chain to the client without
-- re-entering each table's own policies.
create function public.can_access_client(p_client_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.clients where id = p_client_id and consultant_id = auth.uid())
$$;

create function public.can_access_trip(p_trip_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.trips t join public.clients c on c.id = t.client_id
     where t.id = p_trip_id and c.consultant_id = auth.uid())
$$;

create function public.can_access_quote(p_quote_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.quotes q
      join public.trips t on t.id = q.trip_id
      join public.clients c on c.id = t.client_id
     where q.id = p_quote_id and c.consultant_id = auth.uid())
$$;

create function public.can_access_version(p_version_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_access_quote((select quote_id from public.quote_versions where id = p_version_id))
$$;

create function public.can_access_image(p_image_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_access_quote((select quote_id from public.images where id = p_image_id))
$$;

-- Stored files: the first folder is the client id (client-files) or the quote
-- id (quote-files). Anything else is admin-only.
create function public.can_access_file(p_bucket text, p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  head text := split_part(p_name, '/', 1);
begin
  if head !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return public.is_admin();
  end if;
  if p_bucket = 'client-files' then return public.can_access_client(head::uuid); end if;
  if p_bucket = 'quote-files' then return public.can_access_quote(head::uuid); end if;
  return false;
end $$;

do $$
declare f text;
begin
  foreach f in array array['client_code_prefix(text, text)', 'can_access_client(uuid)',
                           'can_access_trip(uuid)', 'can_access_quote(uuid)',
                           'can_access_version(uuid)', 'can_access_image(uuid)',
                           'can_access_file(text, text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- --------------------------------------------------------------- policies
-- Tables from 0006: replace the open read/insert/update; admin_delete stays.
do $$
declare
  t text;
  rule text;
begin
  for t, rule in select * from (values
    ('clients',          'consultant_id = auth.uid() or public.is_admin()'),
    ('client_documents', 'public.can_access_client(client_id)'),
    ('trips',            'public.can_access_client(client_id)'),
    ('quotes',           'public.can_access_trip(trip_id)'),
    ('quote_versions',   'public.can_access_quote(quote_id)'),
    ('images',           'public.can_access_quote(quote_id)'),
    ('extractions',      'public.can_access_image(image_id)')) v
  loop
    execute format('drop policy staff_read on public.%I', t);
    execute format('drop policy staff_insert on public.%I', t);
    execute format('drop policy staff_update on public.%I', t);
    execute format('create policy consultant_read on public.%I for select to authenticated using (%s)', t, rule);
    execute format('create policy consultant_insert on public.%I for insert to authenticated with check (%s)', t, rule);
    -- Client documents are never edited, only added (and removed by admins).
    if t <> 'client_documents' then
      execute format('create policy consultant_update on public.%I for update to authenticated using (%s) with check (%s)', t, rule, rule);
    end if;
  end loop;

  -- Line items inside a quote or trip: fully editable by whoever has the quote.
  for t, rule in select * from (values
    ('trip_stops',     'public.can_access_trip(trip_id)'),
    ('version_images', 'public.can_access_version(version_id)'),
    ('version_items',  'public.can_access_version(version_id)'),
    ('overrides',      'public.can_access_quote(quote_id)'),
    ('manual_items',   'public.can_access_quote(quote_id)'),
    ('item_bookings',  'public.can_access_quote(quote_id)')) v
  loop
    execute format('drop policy staff_all on public.%I', t);
    execute format('create policy consultant_all on public.%I for all to authenticated using (%s) with check (%s)', t, rule, rule);
  end loop;
end $$;

drop policy staff_read on public.item_refs;
create policy consultant_read on public.item_refs for select to authenticated
  using (public.can_access_quote(quote_id));

-- The standard fee schedule (no client) stays readable by all staff.
drop policy staff_read on public.fee_schedules;
create policy staff_read on public.fee_schedules for select to authenticated
  using (client_id is null or public.can_access_client(client_id));
drop policy staff_read on public.fee_schedule_lines;
create policy staff_read on public.fee_schedule_lines for select to authenticated
  using (exists (select 1 from public.fee_schedules s where s.id = schedule_id));   -- the policy above decides

-- Stored files: admins still alone overwrite or delete (0006).
drop policy staff_files_read on storage.objects;
drop policy staff_files_upload on storage.objects;
create policy consultant_files_read on storage.objects for select to authenticated
  using (bucket_id in ('quote-files', 'client-files') and public.can_access_file(bucket_id, name));
create policy consultant_files_upload on storage.objects for insert to authenticated
  with check (bucket_id in ('quote-files', 'client-files') and public.can_access_file(bucket_id, name));

-- ------------------------------------------------------------- self-check
do $$
begin
  assert public.client_code_prefix('Ron', 'Wolovitz') = 'RWOL', 'plain name';
  assert public.client_code_prefix('Zoë', 'Müller') = 'ZMUL', 'accents converted';
  assert public.client_code_prefix('Christelle', 'van der Merwe') = 'CVAN', 'spaces skipped';
  assert public.client_code_prefix('Jo', 'O''Brien') = 'JOBR', 'punctuation skipped';
  assert public.client_code_prefix('Ann', 'Li') = 'ALI', 'short surname';
end $$;
