
-- ===== 0001_init.sql =====
-- TTD quoting app: initial schema.
-- Run in the Supabase SQL editor (or `supabase db push`).
-- Access model: staff only. Sign-ups are disabled in the Supabase dashboard
-- (Authentication -> Providers -> Email -> turn off "Allow new users to sign up"),
-- and users are added with "Invite user". Any signed-in user is therefore staff.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'consultant' check (role in ('consultant', 'admin')),
  -- Per-user default for the edit screen: wireframe stage decides the options.
  edit_view   text not null default 'form' check (edit_view in ('form', 'side_by_side')),
  created_at  timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------ quotes
create sequence public.quote_ref_seq start 1;

create function public.next_quote_ref() returns text
language sql as $$ select 'QUO-' || lpad(nextval('public.quote_ref_seq')::text, 4, '0') $$;

create table public.quotes (
  id           uuid primary key default gen_random_uuid(),
  reference    text not null unique default public.next_quote_ref(),   -- QUO-0001
  title        text not null,
  client_name  text,
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now()
);

-- One row per version of a quote. Each version has exactly one PDF.
create table public.quote_versions (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid not null references public.quotes(id) on delete cascade,
  version_no  int  not null,
  status      text not null default 'draft' check (status in ('draft', 'final')),
  assembled   jsonb,                -- the quote JSON that was rendered (snapshot)
  pdf_path    text,                 -- storage path of this version's PDF
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  unique (quote_id, version_no)
);

-- ------------------------------------------------------------------ images
-- Images are never hard-deleted: "removing" one sets removed_at, so its stored
-- extraction survives and old versions stay reproducible. Re-uploading an image
-- with the same hash restores the existing row instead of creating a duplicate.
create table public.images (
  id            uuid primary key default gen_random_uuid(),
  quote_id      uuid not null references public.quotes(id) on delete cascade,
  storage_path  text not null,
  filename      text not null,
  sha256        text not null,
  size_bytes    bigint not null,
  uploaded_by   uuid not null references public.profiles(id),
  created_at    timestamptz not null default now(),
  removed_at    timestamptz,
  unique (quote_id, sha256)         -- duplicates are only checked within a quote
);

create table public.version_images (
  version_id  uuid not null references public.quote_versions(id) on delete cascade,
  image_id    uuid not null references public.images(id) on delete cascade,
  primary key (version_id, image_id)
);

-- Raw AI output per image. Keyed to the image, so unchanged images are never re-processed.
create table public.extractions (
  id              uuid primary key default gen_random_uuid(),
  image_id        uuid not null references public.images(id) on delete cascade,
  prompt_version  text not null,
  model           text,
  status          text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  image_type      text,             -- classifier result, e.g. GENERIC_QUOTE
  result          jsonb,            -- items as extracted (each item carries a stable entity_id)
  error           text,
  created_at      timestamptz not null default now(),
  unique (image_id, prompt_version)
);

-- ------------------------------------------------------- corrections / manual
-- A correction is keyed to the item (entity_id) and field, NOT to an image, so it
-- survives revisions and survives the source image being removed.
-- It is applied on top of the AI value whenever a version is assembled.
create table public.overrides (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid not null references public.quotes(id) on delete cascade,
  entity_id   text not null,
  field_path  text not null,        -- e.g. 'price' or 'groups.0.flights.1.departs'
  value       jsonb,                -- null = value explicitly cleared
  updated_by  uuid not null references public.profiles(id),
  updated_at  timestamptz not null default now(),
  unique (quote_id, entity_id, field_path)
);

-- Items entered by hand with no source image (a flight, hotel, car rental, ...).
create table public.manual_items (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid not null references public.quotes(id) on delete cascade,
  entity_id   text not null,
  kind        text not null check (kind in ('flight', 'hotel', 'car_rental', 'transfer', 'rail', 'experience')),
  data        jsonb not null,
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  unique (quote_id, entity_id)
);

-- ---------------------------------------------------------------- reference
-- Replaces the monday.com Airport Ref board. Load with scripts/load-airports (next step).
create table public.airports (
  iata        text primary key,
  icao        text,
  name        text not null,
  city        text,
  city_code   text,                 -- IATA metropolitan code where one exists
  country     text,
  country_code text,
  lat         double precision,
  lon         double precision,
  tz          text
);

-- --------------------------------------------------------------------- RLS
alter table public.profiles       enable row level security;
alter table public.quotes         enable row level security;
alter table public.quote_versions enable row level security;
alter table public.images         enable row level security;
alter table public.version_images enable row level security;
alter table public.extractions    enable row level security;
alter table public.overrides      enable row level security;
alter table public.manual_items   enable row level security;
alter table public.airports       enable row level security;

-- Staff-only app: every signed-in user can work with all quotes.
-- (Tighten later with created_by checks if consultants should only see their own.)
create policy staff_all on public.quotes         for all to authenticated using (true) with check (true);
create policy staff_all on public.quote_versions for all to authenticated using (true) with check (true);
create policy staff_all on public.images         for all to authenticated using (true) with check (true);
create policy staff_all on public.version_images for all to authenticated using (true) with check (true);
create policy staff_all on public.extractions    for all to authenticated using (true) with check (true);
create policy staff_all on public.overrides      for all to authenticated using (true) with check (true);
create policy staff_all on public.manual_items   for all to authenticated using (true) with check (true);
create policy staff_read on public.airports      for select to authenticated using (true);

create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

-- ----------------------------------------------------------------- storage
-- Private bucket. Paths: {quote_id}/images/{sha256}.{ext} and {quote_id}/pdf/{reference}-v{n}.pdf
insert into storage.buckets (id, name, public)
values ('quote-files', 'quote-files', false)
on conflict (id) do nothing;

create policy quote_files_rw on storage.objects for all to authenticated
  using (bucket_id = 'quote-files') with check (bucket_id = 'quote-files');

-- ===== 0002_boards_alignment.sql =====
-- TTD quoting app: migration 0002 (revised 20 Oct 2026).
-- DRAFT FOR REVIEW. Read these notes before running.
--
-- Built from the monday.com board exports plus your answers:
--   * References are generated from the CLIENT CODE plus the BOARD SHORTHAND:
--       trip        TRIP-RW001-001
--       quote       QU-RW001-001        (a version is shown as "QU-RW001-001 V2")
--       flight      FLT-RW001-001       hotel HTL-, car rental CRR-, excursion EXR-
--     The number is a per-client counter for each kind, so it never repeats and
--     has no gaps. Shorthands live in ref_prefixes and can be edited.
--   * Client codes (RW001) are generated from the client's initials plus a
--     counter, or you can type one yourself (e.g. to keep an old code).
--   * Post-booking tracking is kept (booking reference, confirmation, tickets,
--     payment deadline and method).
--   * Existing data is discarded: this migration STOPS if public.quotes has
--     rows, because they cannot be given client-based numbers.
--   * Final versions are read-only (you were not sure; this is the safe default
--     because a sent quote is a record). Only "chosen by client" can still change.
--     To change a final quote, create a new version.
--   * Fees come from a fee schedule per client (the "Transaction Fees ... 2025"
--     sheet), not from global defaults. The old fee_defaults idea is dropped.
--
-- The app's New quote form must now pick or create a client and a trip.
-- start_quote() below does that in one step.

do $$
begin
  if exists (select 1 from public.quotes) then
    raise exception 'public.quotes still has rows. They cannot be given client-based numbers. Delete the test quotes first (delete from public.quotes;) and run this again.';
  end if;
end $$;

-- ----------------------------------------------------------------- helpers
create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ------------------------------------------------------------ destinations
-- Replaces the "Destination Reference" board. Code is the IATA city code
-- (LON, PAR, ROM, NYC; for single-airport cities it equals the airport code).
create table public.destinations (
  code           text primary key,
  name           text not null,
  country        text not null,
  country_code   text not null,
  region         text,
  timezone       text,
  currency_code  text,
  continent      text
);

-- --------------------------------------------------------- reference prefixes
-- The board shorthand. The trip prefix is TRIP because the newer client-based
-- boards used TRIP-RW001-006 (the older ones used TRP-RWOLOV-001).
-- TRF and RAIL are guesses: the boards have no transfer or rail board.
create table public.ref_prefixes (
  kind    text primary key check (kind in ('trip', 'quote', 'flight', 'hotel', 'car_rental', 'excursion', 'transfer', 'rail')),
  prefix  text not null unique check (prefix ~ '^[A-Z]{2,5}$')
);
insert into public.ref_prefixes (kind, prefix) values
  ('trip', 'TRIP'), ('quote', 'QU'), ('flight', 'FLT'), ('hotel', 'HTL'),
  ('car_rental', 'CRR'), ('excursion', 'EXR'), ('transfer', 'TRF'), ('rail', 'RAIL');

-- ----------------------------------------------------------------- clients
create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  client_no   text not null unique,                 -- RW001, filled in by a trigger when left empty
  full_name   text not null,
  email       text,
  phone       text,
  notes       text,
  active      boolean not null default true,        -- boards: Active Clients / Inactive Contacts
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger clients_updated_at before update on public.clients
  for each row execute function public.set_updated_at();

-- Counter per initials, so "RW" gives RW001, RW002 ... Direct access is blocked
-- by RLS (no policy); the functions below are SECURITY DEFINER.
create table public.client_code_counters (
  prefix   text primary key,
  last_no  int not null
);

-- First letters of up to three words: "Ron Wolovitz" -> RW, "Van Der Merwe Christelle" -> VDM.
create function public.client_initials(p_name text) returns text
language sql immutable as $$
  select coalesce(
    nullif(left(string_agg(upper(left(w, 1)), '' order by ord), 3), ''),
    'CL')
  from regexp_split_to_table(regexp_replace(coalesce(p_name, ''), '[^[:alpha:] ]', '', 'g'), '\s+')
       with ordinality as t(w, ord)
  where w <> ''
$$;

create function public.set_client_no() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p text;
  n int;
  candidate text;
begin
  if new.client_no is null or btrim(new.client_no) = '' then
    p := public.client_initials(new.full_name);
    loop
      insert into public.client_code_counters (prefix, last_no) values (p, 1)
        on conflict (prefix) do update set last_no = client_code_counters.last_no + 1
        returning last_no into n;
      candidate := p || lpad(n::text, 3, '0');
      -- skip codes someone already typed in by hand
      exit when not exists (select 1 from public.clients where client_no = candidate);
    end loop;
    new.client_no := candidate;
  else
    new.client_no := upper(btrim(new.client_no));
  end if;
  return new;
end $$;
create trigger clients_set_no before insert on public.clients
  for each row execute function public.set_client_no();

-- ID copy, passport copy. Personal information under POPIA: kept in its own
-- private bucket. Decide who may see these and how long they are kept.
create table public.client_documents (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  kind          text not null check (kind in ('id_copy', 'passport_copy', 'other')),
  storage_path  text not null,
  filename      text not null,
  uploaded_by   uuid not null references public.profiles(id),
  created_at    timestamptz not null default now()
);
create index client_documents_client_idx on public.client_documents(client_id);

-- ------------------------------------------------------ reference generator
-- One counter per client per kind. Gap-free (a failed insert rolls the counter
-- back with it). Concurrent requests for the same client queue on the row lock.
create table public.ref_counters (
  client_id  uuid not null references public.clients(id) on delete cascade,
  kind       text not null references public.ref_prefixes(kind),
  last_no    int not null,
  primary key (client_id, kind)
);

create function public.next_ref(p_client_id uuid, p_kind text) returns text
language plpgsql security definer set search_path = public as $$
declare
  pre text;
  cno text;
  n int;
begin
  select prefix into pre from public.ref_prefixes where kind = p_kind;
  if pre is null then
    raise exception 'No reference prefix is set for "%"', p_kind;
  end if;
  select client_no into cno from public.clients where id = p_client_id;
  if cno is null then
    raise exception 'Unknown client %', p_client_id;
  end if;
  insert into public.ref_counters (client_id, kind, last_no) values (p_client_id, p_kind, 1)
    on conflict (client_id, kind) do update set last_no = ref_counters.last_no + 1
    returning last_no into n;
  return pre || '-' || cno || '-' || lpad(n::text, 3, '0');
end $$;

-- ------------------------------------------------------------------- trips
create table public.trips (
  id             uuid primary key default gen_random_uuid(),
  reference      text not null unique,                                  -- TRIP-RW001-001, set by a trigger
  client_id      uuid not null references public.clients(id),
  title          text,
  status         text not null default 'in_progress' check (status in ('in_progress', 'completed', 'cancelled')),
  consultant_id  uuid references public.profiles(id),                   -- board: Person
  starts_on      date,
  ends_on        date,
  nights         int generated always as (ends_on - starts_on) stored,  -- calculated here, never by the AI
  adults         int not null default 1 check (adults >= 0),
  children       int not null default 0 check (children >= 0),          -- board: Children (0 - 17)
  visa_info      text,
  health_info    text,
  insurance_info text,
  terms_profile  text,                                                  -- e.g. standard_za_international
  custom_notes   text,
  created_by     uuid not null references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (starts_on is null or ends_on is null or ends_on >= starts_on)
);
create index trips_client_idx on public.trips(client_id);
create trigger trips_updated_at before update on public.trips
  for each row execute function public.set_updated_at();

create function public.set_trip_ref() returns trigger
language plpgsql as $$
begin
  if new.reference is null or btrim(new.reference) = '' then
    new.reference := public.next_ref(new.client_id, 'trip');
  end if;
  return new;
end $$;
create trigger trips_set_ref before insert on public.trips
  for each row execute function public.set_trip_ref();

-- Itinerary stops (board: Trips subitems). The same city can appear twice.
create table public.trip_stops (
  id                uuid primary key default gen_random_uuid(),
  trip_id           uuid not null references public.trips(id) on delete cascade,
  position          int not null,
  destination       text not null,
  destination_code  text references public.destinations(code),
  starts_on         date,
  ends_on           date,
  nights            int generated always as (ends_on - starts_on) stored,
  highlight         text,
  unique (trip_id, position),
  check (starts_on is null or ends_on is null or ends_on >= starts_on)
);

-- ------------------------------------------------------------------ quotes
-- Replace the global QUO-0001 numbering with client-based numbering.
alter table public.quotes alter column reference drop default;
drop function public.next_quote_ref();
drop sequence public.quote_ref_seq;

alter table public.quotes
  add column trip_id           uuid not null references public.trips(id),
  add column owner_id          uuid references public.profiles(id) default auth.uid(),   -- board: Owner
  add column expected_close_on date,
  add column updated_at        timestamptz not null default now();
alter table public.quotes drop column client_name;      -- the client now comes from the trip
alter table public.quotes alter column title drop not null;

create index quotes_trip_idx on public.quotes(trip_id);
create trigger quotes_updated_at before update on public.quotes
  for each row execute function public.set_updated_at();

create function public.set_quote_ref() returns trigger
language plpgsql as $$
declare cid uuid;
begin
  if new.reference is null or btrim(new.reference) = '' then
    select client_id into cid from public.trips where id = new.trip_id;
    new.reference := public.next_ref(cid, 'quote');
  end if;
  return new;
end $$;
create trigger quotes_set_ref before insert on public.quotes
  for each row execute function public.set_quote_ref();

-- One step for the app: pick or create the client, create the trip, create the quote.
-- Runs as the signed-in user, so row level security still applies.
create function public.start_quote(p_client_id uuid, p_new_client_name text, p_trip_title text)
returns uuid
language plpgsql as $$
declare
  uid uuid := auth.uid();
  cid uuid := p_client_id;
  tid uuid;
  qid uuid;
begin
  if uid is null then
    raise exception 'Not signed in.';
  end if;
  if cid is null and coalesce(btrim(p_new_client_name), '') = '' then
    raise exception 'Choose a client or enter a new client name.';
  end if;
  if cid is not null and coalesce(btrim(p_new_client_name), '') <> '' then
    raise exception 'Choose an existing client or enter a new name, not both.';
  end if;

  if cid is null then
    insert into public.clients (full_name, created_by) values (btrim(p_new_client_name), uid)
      returning id into cid;
  end if;

  insert into public.trips (client_id, title, consultant_id, created_by)
    values (cid, nullif(btrim(coalesce(p_trip_title, '')), ''), uid, uid)
    returning id into tid;

  insert into public.quotes (trip_id, created_by, owner_id)
    values (tid, uid, uid)
    returning id into qid;

  return qid;
end $$;
grant execute on function public.start_quote(uuid, text, text) to authenticated;

-- ------------------------------------------------------------ manual items
-- 0001 used 'experience' here but the extraction code and the boards say
-- 'excursion'. Make them agree.
-- Order matters: drop the old rule first, because it still rejects 'excursion'.
alter table public.manual_items drop constraint manual_items_kind_check;
update public.manual_items set kind = 'excursion' where kind = 'experience';
alter table public.manual_items add constraint manual_items_kind_check
  check (kind in ('flight', 'hotel', 'car_rental', 'excursion', 'transfer', 'rail'));
alter table public.manual_items add column removed_at timestamptz;

-- ------------------------------------------------------------- item numbers
-- The reference of an item (FLT-RW001-003). Assigned the first time the item
-- joins a version and then kept, so the same flight keeps its number in every
-- version of the quote. The counter is per client, so numbers run across all of
-- that client's quotes, like the boards did.
create table public.item_refs (
  quote_id   uuid not null references public.quotes(id) on delete cascade,
  entity_id  text not null,
  kind       text not null check (kind in ('flight', 'hotel', 'car_rental', 'excursion', 'transfer', 'rail')),
  ref        text not null unique,
  primary key (quote_id, entity_id)
);

create function public.assign_item_ref(p_quote_id uuid, p_entity_id text, p_kind text) returns text
language plpgsql security definer set search_path = public as $$
declare
  existing text;
  cid uuid;
  r text;
begin
  select ref into existing from public.item_refs where quote_id = p_quote_id and entity_id = p_entity_id;
  if existing is not null then
    return existing;
  end if;
  select t.client_id into cid
    from public.quotes q join public.trips t on t.id = q.trip_id
    where q.id = p_quote_id;
  r := public.next_ref(cid, p_kind);
  insert into public.item_refs (quote_id, entity_id, kind, ref) values (p_quote_id, p_entity_id, p_kind, r);
  return r;
end $$;

-- ------------------------------------------------------------ version items
-- Which items are in which version, in what order, and which one the client
-- chose. entity_id points at an item inside extractions.result or at
-- manual_items.entity_id.
create table public.version_items (
  version_id        uuid not null references public.quote_versions(id) on delete cascade,
  entity_id         text not null,
  kind              text not null check (kind in ('flight', 'hotel', 'car_rental', 'excursion', 'transfer', 'rail')),
  option_no         int,                                   -- the "Option 1, Option 2 ..." label on the PDF
  chosen_by_client  boolean not null default false,
  primary key (version_id, entity_id)
);

create function public.version_items_assign_ref() returns trigger
language plpgsql as $$
declare qid uuid;
begin
  select quote_id into qid from public.quote_versions where id = new.version_id;
  perform public.assign_item_ref(qid, new.entity_id, new.kind);
  return new;
end $$;
create trigger version_items_assign_ref before insert on public.version_items
  for each row execute function public.version_items_assign_ref();

-- ---------------------------------------------------- final versions are locked
create function public.protect_final_version() returns trigger
language plpgsql as $$
begin
  if old.status = 'final' and (
        new.status     is distinct from old.status
     or new.assembled  is distinct from old.assembled
     or new.pdf_path   is distinct from old.pdf_path
     or new.version_no is distinct from old.version_no
     or new.quote_id   is distinct from old.quote_id) then
    raise exception 'This version is final and read-only. Create a new version to make changes.';
  end if;
  return new;
end $$;
create trigger quote_versions_protect before update on public.quote_versions
  for each row execute function public.protect_final_version();

create function public.protect_final_version_items() returns trigger
language plpgsql as $$
declare
  vid uuid;
  st text;
begin
  if tg_op = 'DELETE' then vid := old.version_id; else vid := new.version_id; end if;
  select status into st from public.quote_versions where id = vid;
  if st = 'final' then
    -- Recording the client's choice after the quote is sent is allowed.
    if tg_op = 'UPDATE'
       and new.version_id = old.version_id and new.entity_id = old.entity_id
       and new.kind = old.kind and new.option_no is not distinct from old.option_no then
      return new;
    end if;
    raise exception 'This version is final and read-only. Create a new version to change its items.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger version_items_protect before insert or update or delete on public.version_items
  for each row execute function public.protect_final_version_items();

-- ----------------------------------------------------------- booking tracking
-- Post-booking fields from the boards: booking reference, confirmation, ticket,
-- payment deadline, payment and booking method. One row per item per quote
-- (not per version, because an item is shared by its versions).
create table public.item_bookings (
  quote_id           uuid not null references public.quotes(id) on delete cascade,
  entity_id          text not null,
  kind               text not null check (kind in ('flight', 'hotel', 'car_rental', 'excursion', 'transfer', 'rail')),
  status             text not null default 'not_booked' check (status in ('not_booked', 'booked', 'ticketed', 'cancelled')),
  booking_reference  text,
  booking_method     text,
  payment_method     text,
  payment_deadline   date,
  ticket_numbers     text[] not null default '{}',     -- flights: one per passenger or leg
  confirmation_path  text,                             -- storage path of the supplier's confirmation file
  notes              text,
  booked_by          uuid references public.profiles(id),
  booked_at          timestamptz,
  updated_at         timestamptz not null default now(),
  primary key (quote_id, entity_id)
);
create trigger item_bookings_updated_at before update on public.item_bookings
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------- fee schedules
-- The "Transaction Fees ... Current 2025" sheet. A schedule belongs to a client,
-- or to nobody (client_id null) when it is the standard one. Amounts are stored
-- excluding VAT; the VAT-inclusive figure is calculated in the view below.
create table public.fee_schedules (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid references public.clients(id) on delete cascade,
  name            text not null,
  currency        text not null default 'ZAR',
  vat_rate        numeric(5, 4) not null default 0.15,
  effective_from  date,
  notes           text,
  created_at      timestamptz not null default now()
);

create table public.fee_schedule_lines (
  id           uuid primary key default gen_random_uuid(),
  schedule_id  uuid not null references public.fee_schedules(id) on delete cascade,
  sort_order   int not null,
  section      text not null,
  code         text not null,                    -- stable key the pricing code looks up, e.g. air_intl_refund
  description  text not null,
  amount_excl  numeric(12, 2),                   -- null when the rule is in "basis"
  basis        text not null default 'fixed' check (basis in ('fixed', 'minimum', 'same_as_booking')),
  unit         text check (unit in ('booking', 'room', 'person', 'policy')),
  vat_applies  boolean not null default false,   -- false when the sheet prints no VAT-inclusive figure
  note         text,
  unique (schedule_id, code)
);

create view public.fee_schedule_lines_priced with (security_invoker = true) as
select
  l.*,
  s.currency,
  s.vat_rate,
  case
    when l.amount_excl is null then null
    when l.vat_applies then round(l.amount_excl * (1 + s.vat_rate), 2)
    else l.amount_excl
  end as amount_incl_vat
from public.fee_schedule_lines l
join public.fee_schedules s on s.id = l.schedule_id;

-- --------------------------------------------------------------------- RLS
alter table public.destinations          enable row level security;
alter table public.ref_prefixes          enable row level security;
alter table public.clients               enable row level security;
alter table public.client_code_counters  enable row level security;   -- no policy: only the functions touch it
alter table public.client_documents      enable row level security;
alter table public.ref_counters          enable row level security;   -- no policy: only the functions touch it
alter table public.trips                 enable row level security;
alter table public.trip_stops            enable row level security;
alter table public.item_refs             enable row level security;
alter table public.version_items         enable row level security;
alter table public.item_bookings         enable row level security;
alter table public.fee_schedules         enable row level security;
alter table public.fee_schedule_lines    enable row level security;

create policy staff_read on public.destinations for select to authenticated using (true);
create policy staff_all  on public.ref_prefixes       for all to authenticated using (true) with check (true);
create policy staff_all  on public.clients            for all to authenticated using (true) with check (true);
create policy staff_all  on public.client_documents   for all to authenticated using (true) with check (true);
create policy staff_all  on public.trips              for all to authenticated using (true) with check (true);
create policy staff_all  on public.trip_stops         for all to authenticated using (true) with check (true);
create policy staff_read on public.item_refs          for select to authenticated using (true);
create policy staff_all  on public.version_items      for all to authenticated using (true) with check (true);
create policy staff_all  on public.item_bookings      for all to authenticated using (true) with check (true);
create policy staff_all  on public.fee_schedules      for all to authenticated using (true) with check (true);
create policy staff_all  on public.fee_schedule_lines for all to authenticated using (true) with check (true);

-- ----------------------------------------------------------------- storage
insert into storage.buckets (id, name, public)
values ('client-files', 'client-files', false)
on conflict (id) do nothing;

create policy client_files_rw on storage.objects for all to authenticated
  using (bucket_id = 'client-files') with check (bucket_id = 'client-files');

-- ===== 0003_seed_destinations.sql =====
-- TTD quoting app: migration 0003.
-- Seeds public.destinations from the Destination Reference board export
-- (111 destinations). Safe to re-run: existing codes are updated.

insert into public.destinations (code, name, country, country_code, region, timezone, currency_code, continent) values
  ('ABJ', 'Abidjan', 'Cote d''Ivoire', 'CI', 'Abidjan', 'Africa/Abidjan', 'XOF', 'AFRICA'),
  ('ACC', 'Accra', 'Ghana', 'GH', 'Greater Accra', 'Africa/Accra', 'GHS', 'AFRICA'),
  ('ADD', 'Addis Ababa', 'Ethiopia', 'ET', 'Addis Ababa', 'Africa/Addis_Ababa', 'ETB', 'AFRICA'),
  ('ALG', 'Algiers', 'Algeria', 'DZ', 'Algiers', 'Africa/Algiers', 'DZD', 'AFRICA'),
  ('CAI', 'Cairo', 'Egypt', 'EG', 'Cairo', 'Africa/Cairo', 'EGP', 'AFRICA'),
  ('CPT', 'Cape Town', 'South Africa', 'ZA', 'Western Cape', 'Africa/Johannesburg', 'ZAR', 'AFRICA'),
  ('CAS', 'Casablanca', 'Morocco', 'MA', 'Casablanca-Settat', 'Africa/Casablanca', 'MAD', 'AFRICA'),
  ('DKR', 'Dakar', 'Senegal', 'SN', 'Dakar', 'Africa/Dakar', 'XOF', 'AFRICA'),
  ('DAR', 'Dar es Salaam', 'Tanzania', 'TZ', 'Dar es Salaam', 'Africa/Dar_es_Salaam', 'TZS', 'AFRICA'),
  ('JNB', 'Johannesburg', 'South Africa', 'ZA', 'Gauteng', 'Africa/Johannesburg', 'ZAR', 'AFRICA'),
  ('KGL', 'Kigali', 'Rwanda', 'RW', 'Kigali', 'Africa/Kigali', 'RWF', 'AFRICA'),
  ('LOS', 'Lagos', 'Nigeria', 'NG', 'Lagos', 'Africa/Lagos', 'NGN', 'AFRICA'),
  ('NBO', 'Nairobi', 'Kenya', 'KE', 'Nairobi', 'Africa/Nairobi', 'KES', 'AFRICA'),
  ('TUN', 'Tunis', 'Tunisia', 'TN', 'Tunis', 'Africa/Tunis', 'TND', 'AFRICA'),
  ('BKK', 'Bangkok', 'Thailand', 'TH', 'Bangkok', 'Asia/Bangkok', 'THB', 'ASIA'),
  ('BJS', 'Beijing', 'China', 'CN', 'Beijing', 'Asia/Shanghai', 'CNY', 'ASIA'),
  ('DEL', 'Delhi', 'India', 'IN', 'Delhi', 'Asia/Kolkata', 'INR', 'ASIA'),
  ('DAC', 'Dhaka', 'Bangladesh', 'BD', 'Dhaka', 'Asia/Dhaka', 'BDT', 'ASIA'),
  ('HAN', 'Hanoi', 'Vietnam', 'VN', 'Hanoi', 'Asia/Ho_Chi_Minh', 'VND', 'ASIA'),
  ('SGN', 'Ho Chi Minh City', 'Vietnam', 'VN', 'Ho Chi Minh City', 'Asia/Ho_Chi_Minh', 'VND', 'ASIA'),
  ('HKG', 'Hong Kong', 'Hong Kong', 'HK', 'Hong Kong', 'Asia/Hong_Kong', 'HKD', 'ASIA'),
  ('JKT', 'Jakarta', 'Indonesia', 'ID', 'Jakarta', 'Asia/Jakarta', 'IDR', 'ASIA'),
  ('KTM', 'Kathmandu', 'Nepal', 'NP', 'Bagmati', 'Asia/Kathmandu', 'NPR', 'ASIA'),
  ('KUL', 'Kuala Lumpur', 'Malaysia', 'MY', 'Federal Territory of KL', 'Asia/Kuala_Lumpur', 'MYR', 'ASIA'),
  ('MNL', 'Manila', 'Philippines', 'PH', 'Metro Manila', 'Asia/Manila', 'PHP', 'ASIA'),
  ('BOM', 'Mumbai', 'India', 'IN', 'Maharashtra', 'Asia/Kolkata', 'INR', 'ASIA'),
  ('OSA', 'Osaka', 'Japan', 'JP', 'Osaka', 'Asia/Tokyo', 'JPY', 'ASIA'),
  ('SEL', 'Seoul', 'South Korea', 'KR', 'Seoul', 'Asia/Seoul', 'KRW', 'ASIA'),
  ('SHA', 'Shanghai', 'China', 'CN', 'Shanghai', 'Asia/Shanghai', 'CNY', 'ASIA'),
  ('SIN', 'Singapore', 'Singapore', 'SG', 'Singapore', 'Asia/Singapore', 'SGD', 'ASIA'),
  ('TPE', 'Taipei', 'Taiwan', 'TW', 'Taipei', 'Asia/Taipei', 'TWD', 'ASIA'),
  ('TYO', 'Tokyo', 'Japan', 'JP', 'Tokyo', 'Asia/Tokyo', 'JPY', 'ASIA'),
  ('MYY', 'Miri', 'Malaysia', 'MY', 'Sarawak', 'Asia/Kuala_Lumpur', 'MYR', 'ASIA'),
  ('BTU', 'Bintulu', 'Malaysia', 'MY', 'Sarawak', 'Asia/Kuala_Lumpur', 'MYR', 'ASIA'),
  ('PTY', 'Panama City', 'Panama', 'PA', 'Panama Province', 'America/Panama', 'PAB', 'CENTRAL AMERICA & CARIBBEAN'),
  ('SJO', 'San Jose (CR)', 'Costa Rica', 'CR', 'San Jose Province', 'America/Costa_Rica', 'CRC', 'CENTRAL AMERICA & CARIBBEAN'),
  ('HAV', 'Havana', 'Cuba', 'CU', 'Havana', 'America/Havana', 'CUP', 'CENTRAL AMERICA & CARIBBEAN'),
  ('SJU', 'San Juan', 'Puerto Rico', 'PR', 'Puerto Rico', 'America/Puerto_Rico', 'USD', 'CENTRAL AMERICA & CARIBBEAN'),
  ('KIN', 'Kingston', 'Jamaica', 'JM', 'Kingston Parish', 'America/Jamaica', 'JMD', 'CENTRAL AMERICA & CARIBBEAN'),
  ('SDQ', 'Santo Domingo', 'Dominican Republic', 'DO', 'Distrito Nacional', 'America/Santo_Domingo', 'DOP', 'CENTRAL AMERICA & CARIBBEAN'),
  ('AMS', 'Amsterdam', 'Netherlands', 'NL', 'North Holland', 'Europe/Amsterdam', 'EUR', 'EUROPE'),
  ('ATH', 'Athens', 'Greece', 'GR', 'Attica', 'Europe/Athens', 'EUR', 'EUROPE'),
  ('BCN', 'Barcelona', 'Spain', 'ES', 'Catalonia', 'Europe/Madrid', 'EUR', 'EUROPE'),
  ('BER', 'Berlin', 'Germany', 'DE', 'Berlin', 'Europe/Berlin', 'EUR', 'EUROPE'),
  ('BRU', 'Brussels', 'Belgium', 'BE', 'Brussels-Capital', 'Europe/Brussels', 'EUR', 'EUROPE'),
  ('CPH', 'Copenhagen', 'Denmark', 'DK', 'Capital Region', 'Europe/Copenhagen', 'DKK', 'EUROPE'),
  ('DUB', 'Dublin', 'Ireland', 'IE', 'Leinster', 'Europe/Dublin', 'EUR', 'EUROPE'),
  ('FRA', 'Frankfurt', 'Germany', 'DE', 'Hesse', 'Europe/Berlin', 'EUR', 'EUROPE'),
  ('GVA', 'Geneva', 'Switzerland', 'CH', 'Geneva', 'Europe/Zurich', 'CHF', 'EUROPE'),
  ('HEL', 'Helsinki', 'Finland', 'FI', 'Uusimaa', 'Europe/Helsinki', 'EUR', 'EUROPE'),
  ('LIS', 'Lisbon', 'Portugal', 'PT', 'Lisbon District', 'Europe/Lisbon', 'EUR', 'EUROPE'),
  ('LON', 'London', 'United Kingdom', 'GB', 'England', 'Europe/London', 'GBP', 'EUROPE'),
  ('MAD', 'Madrid', 'Spain', 'ES', 'Madrid', 'Europe/Madrid', 'EUR', 'EUROPE'),
  ('MIL', 'Milan', 'Italy', 'IT', 'Lombardy', 'Europe/Rome', 'EUR', 'EUROPE'),
  ('MOW', 'Moscow', 'Russia', 'RU', 'Moscow', 'Europe/Moscow', 'RUB', 'EUROPE'),
  ('MUC', 'Munich', 'Germany', 'DE', 'Bavaria', 'Europe/Berlin', 'EUR', 'EUROPE'),
  ('OSL', 'Oslo', 'Norway', 'NO', 'Oslo', 'Europe/Oslo', 'NOK', 'EUROPE'),
  ('PAR', 'Paris', 'France', 'FR', 'Ile-de-France', 'Europe/Paris', 'EUR', 'EUROPE'),
  ('PRG', 'Prague', 'Czech Republic', 'CZ', 'Prague', 'Europe/Prague', 'CZK', 'EUROPE'),
  ('ROM', 'Rome', 'Italy', 'IT', 'Lazio', 'Europe/Rome', 'EUR', 'EUROPE'),
  ('STO', 'Stockholm', 'Sweden', 'SE', 'Stockholm', 'Europe/Stockholm', 'SEK', 'EUROPE'),
  ('VIE', 'Vienna', 'Austria', 'AT', 'Vienna', 'Europe/Vienna', 'EUR', 'EUROPE'),
  ('WAW', 'Warsaw', 'Poland', 'PL', 'Masovian', 'Europe/Warsaw', 'PLN', 'EUROPE'),
  ('ZRH', 'Zurich', 'Switzerland', 'CH', 'Zurich', 'Europe/Zurich', 'CHF', 'EUROPE'),
  ('BGY', 'Milan Bergamo', 'Italy', 'IT', 'Lombardy', 'Europe/Rome', 'EUR', 'EUROPE'),
  ('JTR', 'Santorini / Thira', 'Greece', 'GR', 'South Aegean', 'Europe/Athens', 'EUR', 'EUROPE'),
  ('AMM', 'Amman', 'Jordan', 'JO', 'Amman', 'Asia/Amman', 'JOD', 'MIDDLE EAST'),
  ('BGW', 'Baghdad', 'Iraq', 'IQ', 'Baghdad', 'Asia/Baghdad', 'IQD', 'MIDDLE EAST'),
  ('BEY', 'Beirut', 'Lebanon', 'LB', 'Beirut', 'Asia/Beirut', 'LBP', 'MIDDLE EAST'),
  ('DOH', 'Doha', 'Qatar', 'QA', 'Doha', 'Asia/Qatar', 'QAR', 'MIDDLE EAST'),
  ('DXB', 'Dubai', 'United Arab Emirates', 'AE', 'Dubai', 'Asia/Dubai', 'AED', 'MIDDLE EAST'),
  ('JED', 'Jeddah', 'Saudi Arabia', 'SA', 'Makkah Province', 'Asia/Riyadh', 'SAR', 'MIDDLE EAST'),
  ('KWI', 'Kuwait City', 'Kuwait', 'KW', 'Al Asimah', 'Asia/Kuwait', 'KWD', 'MIDDLE EAST'),
  ('MCT', 'Muscat', 'Oman', 'OM', 'Muscat', 'Asia/Muscat', 'OMR', 'MIDDLE EAST'),
  ('RUH', 'Riyadh', 'Saudi Arabia', 'SA', 'Riyadh Province', 'Asia/Riyadh', 'SAR', 'MIDDLE EAST'),
  ('TLV', 'Tel Aviv', 'Israel', 'IL', 'Tel Aviv District', 'Asia/Jerusalem', 'ILS', 'MIDDLE EAST'),
  ('ATL', 'Atlanta', 'United States', 'US', 'Georgia', 'America/New_York', 'USD', 'NORTH AMERICA'),
  ('BOS', 'Boston', 'United States', 'US', 'Massachusetts', 'America/New_York', 'USD', 'NORTH AMERICA'),
  ('CHI', 'Chicago', 'United States', 'US', 'Illinois', 'America/Chicago', 'USD', 'NORTH AMERICA'),
  ('DFW', 'Dallas', 'United States', 'US', 'Texas', 'America/Chicago', 'USD', 'NORTH AMERICA'),
  ('DEN', 'Denver', 'United States', 'US', 'Colorado', 'America/Denver', 'USD', 'NORTH AMERICA'),
  ('HOU', 'Houston', 'United States', 'US', 'Texas', 'America/Chicago', 'USD', 'NORTH AMERICA'),
  ('LAS', 'Las Vegas', 'United States', 'US', 'Nevada', 'America/Los_Angeles', 'USD', 'NORTH AMERICA'),
  ('LAX', 'Los Angeles', 'United States', 'US', 'California', 'America/Los_Angeles', 'USD', 'NORTH AMERICA'),
  ('MIA', 'Miami', 'United States', 'US', 'Florida', 'America/New_York', 'USD', 'NORTH AMERICA'),
  ('YMQ', 'Montreal', 'Canada', 'CA', 'Quebec', 'America/Toronto', 'CAD', 'NORTH AMERICA'),
  ('NYC', 'New York', 'United States', 'US', 'New York', 'America/New_York', 'USD', 'NORTH AMERICA'),
  ('PHL', 'Philadelphia', 'United States', 'US', 'Pennsylvania', 'America/New_York', 'USD', 'NORTH AMERICA'),
  ('SFO', 'San Francisco', 'United States', 'US', 'California', 'America/Los_Angeles', 'USD', 'NORTH AMERICA'),
  ('SEA', 'Seattle', 'United States', 'US', 'Washington', 'America/Los_Angeles', 'USD', 'NORTH AMERICA'),
  ('YTO', 'Toronto', 'Canada', 'CA', 'Ontario', 'America/Toronto', 'CAD', 'NORTH AMERICA'),
  ('YVR', 'Vancouver', 'Canada', 'CA', 'British Columbia', 'America/Vancouver', 'CAD', 'NORTH AMERICA'),
  ('WAS', 'Washington, D.C.', 'United States', 'US', 'District of Columbia', 'America/New_York', 'USD', 'NORTH AMERICA'),
  ('MEX', 'Mexico City', 'Mexico', 'MX', 'Mexico City', 'America/Mexico_City', 'MXN', 'NORTH AMERICA'),
  ('GDL', 'Guadalajara', 'Mexico', 'MX', 'Jalisco', 'America/Mexico_City', 'MXN', 'NORTH AMERICA'),
  ('MTY', 'Monterrey', 'Mexico', 'MX', 'Nuevo Leon', 'America/Monterrey', 'MXN', 'NORTH AMERICA'),
  ('AKL', 'Auckland', 'New Zealand', 'NZ', 'Auckland', 'Pacific/Auckland', 'NZD', 'OCEANIA'),
  ('BNE', 'Brisbane', 'Australia', 'AU', 'Queensland', 'Australia/Brisbane', 'AUD', 'OCEANIA'),
  ('MEL', 'Melbourne', 'Australia', 'AU', 'Victoria', 'Australia/Melbourne', 'AUD', 'OCEANIA'),
  ('PER', 'Perth', 'Australia', 'AU', 'Western Australia', 'Australia/Perth', 'AUD', 'OCEANIA'),
  ('SYD', 'Sydney', 'Australia', 'AU', 'New South Wales', 'Australia/Sydney', 'AUD', 'OCEANIA'),
  ('WLG', 'Wellington', 'New Zealand', 'NZ', 'Wellington', 'Pacific/Auckland', 'NZD', 'OCEANIA'),
  ('BOG', 'Bogota', 'Colombia', 'CO', 'Bogota D.C.', 'America/Bogota', 'COP', 'SOUTH AMERICA'),
  ('BUE', 'Buenos Aires', 'Argentina', 'AR', 'Buenos Aires', 'America/Argentina/Buenos_Aires', 'ARS', 'SOUTH AMERICA'),
  ('CCS', 'Caracas', 'Venezuela', 'VE', 'Distrito Capital', 'America/Caracas', 'VES', 'SOUTH AMERICA'),
  ('LIM', 'Lima', 'Peru', 'PE', 'Lima', 'America/Lima', 'PEN', 'SOUTH AMERICA'),
  ('MVD', 'Montevideo', 'Uruguay', 'UY', 'Montevideo', 'America/Montevideo', 'UYU', 'SOUTH AMERICA'),
  ('UIO', 'Quito', 'Ecuador', 'EC', 'Pichincha', 'America/Guayaquil', 'USD', 'SOUTH AMERICA'),
  ('RIO', 'Rio de Janeiro', 'Brazil', 'BR', 'Rio de Janeiro', 'America/Sao_Paulo', 'BRL', 'SOUTH AMERICA'),
  ('SCL', 'Santiago', 'Chile', 'CL', 'Santiago Metropolitan', 'America/Santiago', 'CLP', 'SOUTH AMERICA'),
  ('SAO', 'Sao Paulo', 'Brazil', 'BR', 'Sao Paulo', 'America/Sao_Paulo', 'BRL', 'SOUTH AMERICA')
on conflict (code) do update set
  name = excluded.name,
  country = excluded.country,
  country_code = excluded.country_code,
  region = excluded.region,
  timezone = excluded.timezone,
  currency_code = excluded.currency_code,
  continent = excluded.continent;

-- ===== 0004_seed_fee_schedule.sql =====
-- 0004: fee schedule from the sheet "TRANSACTION FEES ORE AND METAL - CURRENT 2025".
-- Transcribed from two photos. Amounts are excluding VAT. vat_applies is true only
-- where the sheet prints a VAT-inclusive figure (each printed figure equals the
-- excl amount x 1.15, checked). Blank on the sheet = no VAT added here; please confirm.
-- Sheet notes: fees increase annually according to CPI; fees exclude VAT.
-- Stored as the standard schedule (client_id null). Attach it to the Ore and Metal
-- client once that client exists:  update public.fee_schedules set client_id = '<id>' where ...
-- Safe to re-run: it replaces this schedule.

delete from public.fee_schedules where name = 'Ore and Metal - Current 2025' and client_id is null;

with s as (
  insert into public.fee_schedules (name, currency, vat_rate, effective_from, notes)
  values ('Ore and Metal - Current 2025', 'ZAR', 0.15, '2025-01-01',
          'Transcribed from a photographed sheet. Fees increase annually according to CPI. Fees exclude VAT.')
  returning id
)
insert into public.fee_schedule_lines (schedule_id, sort_order, section, code, description, amount_excl, basis, unit, vat_applies, note)
select s.id, v.sort_order, v.section, v.code, v.description, v.amount_excl, v.basis, v.unit, v.vat_applies, v.note
from s, (values
  (1, 'Domestic air', 'air_dom_ticket', 'New ticket / internet / re-issue / redemption', 380::numeric, 'fixed', 'booking', true, null),
  (2, 'Domestic air', 'air_dom_refund', 'Refund', 468::numeric, 'fixed', 'booking', true, null),
  (3, 'Neighbouring countries air (Mozambique, Botswana, Zimbabwe, Namibia, Swaziland, Lesotho, Zambia)', 'air_neigh_ticket', 'New ticket / internet / re-issue / redemption', 650::numeric, 'fixed', 'booking', false, null),
  (4, 'Neighbouring countries air (Mozambique, Botswana, Zimbabwe, Namibia, Swaziland, Lesotho, Zambia)', 'air_neigh_refund', 'Refund', 650::numeric, 'fixed', 'booking', false, null),
  (5, 'Local air: travel within a country (international)', 'air_local_intl_ticket', 'New ticket / internet / re-issue / redemption', 650::numeric, 'fixed', 'booking', false, null),
  (6, 'Local air: travel within a country (international)', 'air_local_intl_refund', 'Refund', 650::numeric, 'fixed', 'booking', false, null),
  (7, 'International air', 'air_intl_economy_ticket', 'New ticket / internet / re-issue / redemption, economy', 1470::numeric, 'fixed', 'booking', false, null),
  (8, 'International air', 'air_intl_reissue_all', 'Reissue, all classes', 1470::numeric, 'fixed', 'booking', false, null),
  (9, 'International air', 'air_intl_side_ticket', 'Internal side ticket', 650::numeric, 'fixed', 'booking', false, null),
  (10, 'International air', 'air_intl_premium_ticket', 'International business / first class, including Africa', 2020::numeric, 'fixed', 'booking', false, null),
  (11, 'International air', 'air_intl_refund', 'Refund', 825::numeric, 'fixed', 'booking', false, null),
  (12, 'Hotel reservations', 'hotel_dom', 'New booking (per room), domestic', 200::numeric, 'fixed', 'room', true, null),
  (13, 'Hotel reservations', 'hotel_intl', 'New booking (per room), neighbouring and international', 300::numeric, 'fixed', 'room', false, null),
  (14, 'Hotel reservations', 'hotel_billback', 'Bill back / prepayment (only for 30 day account)', 484::numeric, 'fixed', 'booking', true, null),
  (15, 'Car hire / chauffeur drive', 'car_dom', 'New car hire booking, domestic', 200::numeric, 'fixed', 'booking', true, null),
  (16, 'Car hire / chauffeur drive', 'car_intl', 'New car hire booking, neighbouring and international', 300::numeric, 'fixed', 'booking', false, null),
  (17, 'Car hire / chauffeur drive', 'car_billback', 'Bill back / prepayment. A 10% fee is generated if the total amount exceeds the percentage of the prepayment fee', 510::numeric, 'fixed', 'booking', true, 'The 10% rule is not applied by the app yet.'),
  (18, 'Transfers', 'transfer_dom', 'New booking, domestic', 200::numeric, 'fixed', 'booking', true, null),
  (19, 'Transfers', 'transfer_intl', 'New booking, neighbouring and international', 300::numeric, 'fixed', 'booking', false, null),
  (20, 'Transfers', 'transfer_prepay_dom', 'Pre payment fee, domestic', 250::numeric, 'fixed', 'booking', true, null),
  (21, 'Transfers', 'transfer_prepay_intl', 'Pre payment fee, international', 300::numeric, 'fixed', 'booking', false, null),
  (22, 'Insurance', 'insurance_policy', 'Per policy', 140::numeric, 'fixed', 'policy', false, null),
  (23, 'Visas', 'visa_person', 'Per person''s visa', 460::numeric, 'fixed', 'person', true, null),
  (24, 'Tour operators', 'rail_reservation', 'Rail reservations', 300::numeric, 'fixed', 'booking', false, null),
  (25, 'Tour operators', 'conference_person', 'Conferences / meetings, per person', 200::numeric, 'fixed', 'person', true, null),
  (26, 'Seating and baggage', 'preseat_online', 'Online pre-seating fee (per booking)', 250::numeric, 'fixed', 'booking', true, null),
  (27, 'Seating and baggage', 'extra_baggage', 'Additional baggage', 250::numeric, 'fixed', 'booking', true, null),
  (28, 'Additional services', 'after_hours', 'After hours emergency services', 825::numeric, 'fixed', 'booking', true, null),
  (29, 'Additional services', 'meet_greet', 'Airport meet and greet', 165::numeric, 'fixed', 'booking', true, null),
  (30, 'Additional services', 'cancel_unissued', 'Cancellation fee (booked but not issued)', null::numeric, 'same_as_booking', 'booking', false, 'Same as the booking fee for that item.'),
  (31, 'Reporting', 'report_mis', 'MIS reports', 650::numeric, 'fixed', null, true, null),
  (32, 'Reporting', 'report_adhoc', 'Miscellaneous reporting, ad hoc reports', 495::numeric, 'minimum', null, true, 'Minimum charge.')
) as v(sort_order, section, code, description, amount_excl, basis, unit, vat_applies, note);
