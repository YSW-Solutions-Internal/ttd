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
