-- Company Clients, Travellers with IDs and Passports, new Trip statuses (GLOSSARY).
-- Run in the Supabase SQL editor after 0021.
--
--   * A Client is a person (first and last name) or a company (company name and an
--     optional contact person), chosen when added and never changed. A company's
--     code is the first four letters of its name (Ore and Metal -> OREA01).
--   * Trip status: Enquiry, Quoted, Booked, Travelled, Cancelled. Existing Trips:
--     in progress with a Version -> Quoted, without -> Enquiry; completed -> Travelled.
--   * Trips get TA number, cost centre and authorising person (shown for companies).
--   * Travellers belong to one Client and go on any of its Trips. Every person Client
--     gets one automatically, existing ones included. Only admins delete one, and
--     only while it is on no Trip.
--   * identity_documents holds each Traveller's ID (at most one) and Passports (any
--     number), with an optional image in client-files. Seen only by the Client's
--     Consultant and Administrators; only admins delete. traveller_flags tells
--     everyone whether a Traveller has either, without showing what.
--   * Client documents keep only 'other'; ID and passport images go with the Traveller.

-- ---------------------------------------------------------------- clients
alter table public.clients
  add column kind         text not null default 'person' check (kind in ('person', 'company')),
  add column company_name text,
  add column contact_name text,
  alter column first_name drop not null,
  alter column last_name drop not null,
  drop constraint clients_first_name_check,
  drop constraint clients_last_name_check,
  add constraint clients_names check (
    kind = 'person' and coalesce(btrim(first_name), '') <> '' and coalesce(btrim(last_name), '') <> '' and company_name is null
    or kind = 'company' and coalesce(btrim(company_name), '') <> '' and first_name is null and last_name is null);

alter table public.clients drop column full_name;
alter table public.clients
  add column full_name text generated always as (coalesce(company_name, first_name || ' ' || last_name)) stored,
  add column sort_name text generated always as (coalesce(company_name, last_name || ' ' || first_name)) stored;

-- "Ore and Metal Services" -> OREA. Letters only, accents converted, as for people.
create function public.company_code_prefix(p_name text) returns text
language sql stable set search_path = public, extensions as $$
  select upper(left(regexp_replace(unaccent(coalesce(p_name, '')), '[^A-Za-z]', '', 'g'), 4))
$$;

-- Same as 0007, with the company prefix.
create or replace function public.set_client_code() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p text := case when new.kind = 'company' then public.company_code_prefix(new.company_name)
                 else public.client_code_prefix(new.first_name, new.last_name) end;
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

create or replace function public.protect_client_code() returns trigger
language plpgsql as $$
begin
  if new.client_code is distinct from old.client_code then
    raise exception 'A client code never changes.';
  end if;
  if new.kind is distinct from old.kind then
    raise exception 'A client cannot change between person and company.';
  end if;
  return new;
end $$;

-- ------------------------------------------------------------------ trips
alter table public.trips drop constraint trips_status_check;
update public.trips t set status = case
  when t.status = 'completed' then 'travelled'
  when t.status = 'cancelled' then 'cancelled'
  when exists (select 1 from public.quotes q join public.quote_versions v on v.quote_id = q.id where q.trip_id = t.id)
    then 'quoted'
  else 'enquiry' end;
alter table public.trips
  alter column status set default 'enquiry',
  add constraint trips_status_check check (status in ('enquiry', 'quoted', 'booked', 'travelled', 'cancelled')),
  add column ta_number          text,
  add column cost_centre        text,
  add column authorising_person text;

-- ------------------------------------------------------------- travellers
create table public.travellers (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  title         text,
  first_name    text not null check (btrim(first_name) <> ''),
  last_name     text not null check (btrim(last_name) <> ''),
  date_of_birth date,
  email         text,
  phone         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index travellers_client_idx on public.travellers(client_id);
create trigger travellers_updated_at before update on public.travellers
  for each row execute function public.set_updated_at();

create table public.trip_travellers (
  trip_id      uuid not null references public.trips(id) on delete cascade,
  traveller_id uuid not null references public.travellers(id),   -- restrict: a Traveller on a Trip is never deleted
  created_at   timestamptz not null default now(),
  primary key (trip_id, traveller_id)
);
create index trip_travellers_traveller_idx on public.trip_travellers(traveller_id);

create table public.identity_documents (
  id              uuid primary key default gen_random_uuid(),
  traveller_id    uuid not null references public.travellers(id) on delete cascade,
  kind            text not null check (kind in ('id', 'passport')),
  number          text not null check (btrim(number) <> ''),
  nationality     text,
  issued_on       date,
  expires_on      date,
  name_as_printed text,
  image_path      text,             -- client-files: <client id>/travellers/<file>
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint identity_documents_passport check (
    kind = 'id' or coalesce(btrim(nationality), '') <> '' and issued_on is not null and expires_on is not null)
);
create unique index identity_documents_one_id on public.identity_documents(traveller_id) where kind = 'id';
create trigger identity_documents_updated_at before update on public.identity_documents
  for each row execute function public.set_updated_at();

-- Runs as the view's owner, so every User sees whether a Traveller has an ID or
-- Passport (the flag) without seeing the documents themselves.
create view public.traveller_flags as
  select t.id as traveller_id, t.client_id, exists (select 1 from public.identity_documents d where d.traveller_id = t.id) as identified
    from public.travellers t;
grant select on public.traveller_flags to authenticated;

alter table public.travellers enable row level security;
create policy staff_read   on public.travellers for select to authenticated using (true);
create policy staff_insert on public.travellers for insert to authenticated with check (public.can_edit());
create policy staff_update on public.travellers for update to authenticated using (public.can_edit()) with check (public.can_edit());
create policy admin_delete on public.travellers for delete to authenticated using (public.is_admin());

alter table public.trip_travellers enable row level security;
create policy staff_read on public.trip_travellers for select to authenticated using (true);
-- Only the Trip's own Client's Travellers.
create policy staff_insert on public.trip_travellers for insert to authenticated with check (
  public.can_edit() and exists (select 1 from public.trips t join public.travellers v on v.client_id = t.client_id
                                 where t.id = trip_id and v.id = traveller_id));
create policy staff_delete on public.trip_travellers for delete to authenticated using (public.can_edit());

alter table public.identity_documents enable row level security;
create policy consultant_read on public.identity_documents for select to authenticated
  using (public.can_access_client((select client_id from public.travellers where id = traveller_id)));
create policy consultant_insert on public.identity_documents for insert to authenticated
  with check (public.can_access_client((select client_id from public.travellers where id = traveller_id)));
create policy consultant_update on public.identity_documents for update to authenticated
  using (public.can_access_client((select client_id from public.travellers where id = traveller_id)))
  with check (public.can_access_client((select client_id from public.travellers where id = traveller_id)));
create policy admin_delete on public.identity_documents for delete to authenticated using (public.is_admin());

-- A person Client is one of their own Travellers.
create function public.add_client_traveller() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.kind = 'person' then
    insert into public.travellers (client_id, first_name, last_name, email, phone)
    values (new.id, new.first_name, new.last_name, new.email, new.phone);
  end if;
  return null;
end $$;
create trigger clients_add_traveller after insert on public.clients
  for each row execute function public.add_client_traveller();

insert into public.travellers (client_id, first_name, last_name, email, phone)
select id, first_name, last_name, email, phone from public.clients where kind = 'person';

-- ------------------------------------------------------- client documents
update public.client_documents set kind = 'other';
alter table public.client_documents
  alter column kind set default 'other',
  drop constraint client_documents_kind_check,
  add constraint client_documents_kind_check check (kind = 'other');

-- ---------------------------------------------------------------- History
-- Same as 0021, plus the Client of a Traveller's ID or Passport, so the Client page
-- shows it and the policy below keeps it private.
create or replace function public.record_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  b jsonb;
  a jsonb;
  trip uuid;
  client uuid := case when tg_table_name = 'clients' then (r ->> 'id')::uuid else (r ->> 'client_id')::uuid end;
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
  if tg_table_name = 'identity_documents' then
    select client_id into client from public.travellers where id = (r ->> 'traveller_id')::uuid;
  end if;

  insert into public.history (user_id, table_name, row_id, action, client_id, trip_id, before, after)
  values (auth.uid(), tg_table_name,
          coalesce(r ->> 'id', r ->> 'code', nullif(concat_ws('/', r ->> 'schedule_id', r ->> 'kind', r ->> 'fee_region'), ''),
                   concat_ws('/', r ->> 'trip_id', r ->> 'traveller_id')),
          lower(tg_op), client, trip, b, a);
  return null;
end $$;

alter policy staff_read on public.history
  using (table_name not in ('client_documents', 'identity_documents') or public.can_access_client(client_id));

do $$
declare t text;
begin
  foreach t in array array['travellers', 'trip_travellers', 'identity_documents'] loop
    execute format('create trigger %I_history after insert or update or delete on public.%I
                      for each row execute function public.record_history()', t, t);
  end loop;
end $$;

-- ------------------------------------------------------------- self-check
do $$
begin
  assert public.company_code_prefix('Ore and Metal Services') = 'OREA', 'spaces skipped';
  assert public.company_code_prefix('Émeraude Tours') = 'EMER', 'accents converted';
  assert public.company_code_prefix('3M') = 'M', 'digits skipped';
end $$;
