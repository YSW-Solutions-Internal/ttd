-- Supplier invoices and Client invoices, linked to booked Items and Changes (GLOSSARY, ADR 0012).
-- Run in the Supabase SQL editor after 0023.
--
--   * invoices: both sides in one table. A credit note is the same record with a negative
--     amount. A Supplier invoice has a Supplier, a currency and a status (Received,
--     Verified, Query); a Client invoice (from Quicktrav) is in Rand and has no status.
--     Numbers are unique per Supplier, and Quicktrav numbers overall.
--   * invoice_links: the part of an invoice's amount that belongs to one booked Item or
--     one of its Changes, on the invoice's Trip (and the invoice's Supplier). An Item with
--     invoices linked cannot be unbooked.
--   * Who: while the Trip is an Enquiry or Quoted, the Client's Consultant and
--     Administrators add and edit invoices; once Booked, Travelled or Cancelled, any User.
--     Only Accountants and Administrators change a Supplier invoice's status, and they may
--     edit any invoice. Once Verified, only Administrators edit or delete it.
--   * Verify: the whole amount is linked, and no Item or Change would be charged more than
--     was booked, or in another currency. A difference is fixed (Correction, Change or
--     Query), never explained away.
--   * Corrections: once a Supplier invoice linked to a booking or Change is Verified, only
--     Administrators correct its Supplier, reference or amounts.
--   * No supplier invoice expected: a flag on a booking or Change that only Accountants and
--     Administrators set, through set_no_supplier_invoice().
--   * Files: private bucket invoice-files, read by every User, uploaded as invoices are added.

create function public.is_accounts() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('accountant', 'admin'))
$$;
revoke execute on function public.is_accounts() from public, anon;
grant execute on function public.is_accounts() to authenticated;

create function public.can_add_invoice(p_trip_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.trips t join public.clients c on c.id = t.client_id
     where t.id = p_trip_id
       and (t.status in ('booked', 'travelled', 'cancelled') or c.consultant_id = auth.uid()))
$$;
revoke execute on function public.can_add_invoice(uuid) from public, anon;
grant execute on function public.can_add_invoice(uuid) to authenticated;

-- ---------------------------------------------------------------- invoices
create table public.invoices (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips(id) on delete restrict,
  side         text not null check (side in ('supplier', 'client')),
  supplier_id  uuid references public.suppliers(id),
  number       text not null check (btrim(number) <> ''),
  issued_on    date not null,
  amount       numeric(12, 2) not null check (amount <> 0),   -- negative: a credit note
  currency     text not null default 'ZAR' check (currency ~ '^[A-Z]{3}$'),
  file_path    text not null,
  status       text check (status in ('received', 'verified', 'query')),
  query_reason text,
  created_by   uuid default auth.uid() references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint invoices_side check (
    side = 'supplier' and supplier_id is not null and status is not null
    or side = 'client' and supplier_id is null and status is null and currency = 'ZAR'),
  constraint invoices_query_reason check (status is distinct from 'query' or btrim(coalesce(query_reason, '')) <> '')
);
create unique index invoices_supplier_number on public.invoices (supplier_id, lower(btrim(number))) where side = 'supplier';
create unique index invoices_client_number on public.invoices (lower(btrim(number))) where side = 'client';
create index invoices_trip on public.invoices (trip_id);
create trigger invoices_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();

alter table public.invoices enable row level security;
create policy staff_read   on public.invoices for select to authenticated using (true);
create policy staff_insert on public.invoices for insert to authenticated
  with check (public.can_add_invoice(trip_id) and (side = 'client' or status = 'received'));
create policy staff_update on public.invoices for update to authenticated
  using (public.can_add_invoice(trip_id) or public.is_accounts())
  with check (public.can_add_invoice(trip_id) or public.is_accounts());
create policy staff_delete on public.invoices for delete to authenticated
  using (public.can_add_invoice(trip_id) and (status is distinct from 'verified' or public.is_admin()));

-- ------------------------------------------------------------------ links
-- One link per booking or Change per invoice; change_id empty means the Item itself.
create unique index item_changes_of_item on public.item_changes (id, quote_id, entity_id);

create table public.invoice_links (
  id         uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  quote_id   uuid not null,
  entity_id  text not null,
  change_id  uuid,
  amount     numeric(12, 2) not null check (amount <> 0),
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  -- Unbooking, or deleting a Change, is refused while an invoice points at it.
  foreign key (quote_id, entity_id) references public.item_bookings (quote_id, entity_id) on delete restrict,
  foreign key (change_id, quote_id, entity_id) references public.item_changes (id, quote_id, entity_id) on delete restrict,
  unique nulls not distinct (invoice_id, quote_id, entity_id, change_id)
);
create index invoice_links_item on public.invoice_links (quote_id, entity_id);

create function public.can_change_invoice(p_invoice_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.invoices i where i.id = p_invoice_id
                    and (public.can_add_invoice(i.trip_id) or public.is_accounts())
                    and (i.status is distinct from 'verified' or public.is_admin()))
$$;
revoke execute on function public.can_change_invoice(uuid) from public, anon;
grant execute on function public.can_change_invoice(uuid) to authenticated;

alter table public.invoice_links enable row level security;
create policy staff_read   on public.invoice_links for select to authenticated using (true);
create policy staff_insert on public.invoice_links for insert to authenticated with check (public.can_change_invoice(invoice_id));
create policy staff_update on public.invoice_links for update to authenticated
  using (public.can_change_invoice(invoice_id)) with check (public.can_change_invoice(invoice_id));
create policy staff_delete on public.invoice_links for delete to authenticated using (public.can_change_invoice(invoice_id));

-- A link points at a booking on the invoice's Trip, and a Supplier invoice only at that Supplier's.
create function public.guard_invoice_link() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv public.invoices;
begin
  select * into inv from public.invoices where id = new.invoice_id;
  if not exists (select 1 from public.quotes where id = new.quote_id and trip_id = inv.trip_id) then
    raise exception 'An invoice can only be linked to Items on its own Trip.' using errcode = 'check_violation';
  end if;
  if inv.side = 'supplier' and not exists (
       select 1 from public.item_bookings
        where quote_id = new.quote_id and entity_id = new.entity_id and supplier_id = inv.supplier_id) then
    raise exception 'A Supplier invoice can only be linked to Items booked with that Supplier.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger invoice_links_guard before insert or update on public.invoice_links
  for each row execute function public.guard_invoice_link();

-- ----------------------------------------------------------------- Verify
create function public.check_verifiable(inv public.invoices) returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  billed numeric;
begin
  if coalesce((select sum(amount) from public.invoice_links where invoice_id = inv.id), 0) <> inv.amount then
    raise exception 'Link all of the invoice''s amount to Items or Changes before verifying it.' using errcode = 'check_violation';
  end if;
  for r in
    select l.quote_id, l.entity_id, l.change_id,
           coalesce(c.currency, b.currency) as currency,
           case when l.change_id is null then b.amount
                else c.extra_fare + c.extra_taxes + c.supplier_penalty end as booked,
           coalesce(c.description, b.booking_reference) as label
      from public.invoice_links l
      join public.item_bookings b using (quote_id, entity_id)
      left join public.item_changes c on c.id = l.change_id
     where l.invoice_id = inv.id
  loop
    if r.currency <> inv.currency then
      raise exception '% was booked in %, but this invoice is in %. Correct the booking, or put the invoice in Query.',
        r.label, r.currency, inv.currency using errcode = 'check_violation';
    end if;
    select coalesce(sum(l.amount), 0) into billed
      from public.invoice_links l join public.invoices i on i.id = l.invoice_id
     where l.quote_id = r.quote_id and l.entity_id = r.entity_id and l.change_id is not distinct from r.change_id
       and i.side = 'supplier' and (i.status = 'verified' or i.id = inv.id);
    if billed > r.booked then
      raise exception '% was booked at % %, but the Supplier has invoiced % %. Correct the booking, record a Change, or put the invoice in Query.',
        r.label, r.currency, r.booked, r.currency, billed using errcode = 'check_violation';
    end if;
  end loop;
end $$;
revoke execute on function public.check_verifiable(public.invoices) from public, anon, authenticated;

create function public.guard_invoice() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.trip_id <> old.trip_id or new.side <> old.side then
    raise exception 'An invoice stays on its Trip and side; delete it and add it again.' using errcode = 'check_violation';
  end if;
  if auth.uid() is null then return new; end if;   -- the SQL editor and service key are trusted
  if new.status is distinct from old.status and not public.is_accounts() then
    raise exception 'Only an Accountant or Administrator can verify or query a Supplier invoice.' using errcode = 'insufficient_privilege';
  end if;
  if old.status = 'verified' and not public.is_admin()
     and (to_jsonb(new) - array['status', 'query_reason', 'updated_at']) <> (to_jsonb(old) - array['status', 'query_reason', 'updated_at']) then
    raise exception 'This invoice is verified; only an administrator can change it.' using errcode = 'insufficient_privilege';
  end if;
  if new.status = 'verified' and old.status is distinct from 'verified' then
    perform public.check_verifiable(new);
  end if;
  return new;
end $$;
create trigger invoices_guard before update on public.invoices
  for each row execute function public.guard_invoice();

-- ------------------------------------------------- Corrections after Verify
-- Also: only Accountants and Administrators set "No supplier invoice expected".
alter table public.item_bookings add column no_supplier_invoice boolean not null default false;
alter table public.item_changes add column no_supplier_invoice boolean not null default false;

create function public.guard_verified_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  -- item_bookings has no id; a Change's links name it.
  v_change uuid := case when tg_table_name = 'item_changes' then (to_jsonb(old) ->> 'id')::uuid end;
begin
  if auth.uid() is null then return new; end if;
  if new.no_supplier_invoice is distinct from old.no_supplier_invoice and not public.is_accounts() then
    raise exception 'Only an Accountant or Administrator can mark that no supplier invoice is expected.' using errcode = 'insufficient_privilege';
  end if;
  if not public.is_admin()
     and (to_jsonb(new) - array['no_supplier_invoice', 'issued_at', 'ticket_numbers', 'notes', 'description', 'updated_at'])
         <> (to_jsonb(old) - array['no_supplier_invoice', 'issued_at', 'ticket_numbers', 'notes', 'description', 'updated_at'])
     and exists (select 1 from public.invoice_links l join public.invoices i on i.id = l.invoice_id
                  where l.quote_id = old.quote_id and l.entity_id = old.entity_id
                    and l.change_id is not distinct from v_change
                    and i.side = 'supplier' and i.status = 'verified') then
    raise exception 'A Supplier invoice for this is verified; only an administrator can correct it now.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger item_bookings_verified before update on public.item_bookings
  for each row execute function public.guard_verified_booking();
create trigger item_changes_verified before update on public.item_changes
  for each row execute function public.guard_verified_booking();

-- Accountants edit no booking, so the flag is set here; the trigger above checks who.
create function public.set_no_supplier_invoice(p_quote_id uuid, p_entity_id text, p_change_id uuid, p_value boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_accounts() then
    raise exception 'Only an Accountant or Administrator can mark that no supplier invoice is expected.' using errcode = 'insufficient_privilege';
  end if;
  if p_change_id is null then
    update public.item_bookings set no_supplier_invoice = p_value where quote_id = p_quote_id and entity_id = p_entity_id;
  else
    update public.item_changes set no_supplier_invoice = p_value
     where id = p_change_id and quote_id = p_quote_id and entity_id = p_entity_id;
  end if;
end $$;
revoke execute on function public.set_no_supplier_invoice(uuid, text, uuid, boolean) from public, anon;
grant execute on function public.set_no_supplier_invoice(uuid, text, uuid, boolean) to authenticated;

-- ------------------------------------------------------------------ files
insert into storage.buckets (id, name, public) values ('invoice-files', 'invoice-files', false);

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
  -- Invoice files sit under their Trip's id.
  if p_bucket = 'invoice-files' then return public.can_add_invoice(head::uuid); end if;
  return false;
end $$;
alter policy consultant_files_read on storage.objects
  using (bucket_id in ('quote-files', 'invoice-files') or bucket_id = 'client-files' and public.can_access_file(bucket_id, name));
alter policy consultant_files_upload on storage.objects
  with check (bucket_id in ('quote-files', 'client-files', 'invoice-files') and public.can_access_file(bucket_id, name));

-- ----------------------------------------------------------------- History
do $$
declare t text;
begin
  foreach t in array array['invoices', 'invoice_links'] loop
    execute format('create trigger %I_history after insert or update or delete on public.%I
                      for each row execute function public.record_history()', t, t);
  end loop;
end $$;
