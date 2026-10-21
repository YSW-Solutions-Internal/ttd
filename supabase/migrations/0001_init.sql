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
