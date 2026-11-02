-- Payment accounts and Payments (GLOSSARY: Payment, Payment account; ADR 0013).
-- Run in the Supabase SQL editor after 0026.
--
--   * payment_accounts: nicknames only, never card numbers. The agency's own (no Client:
--     a bank account, a card, the cash box) or a Client's (EFT, which every Client has from
--     the start, plus cards and Cash). Administrators add and retire them; one that has
--     been used keeps its nickname and kind for good. None is ever deleted.
--   * payments: paid to a Supplier or received from the Client, on one Trip. Client
--     Payments are in Rand. A Client's EFT or Cash Payment names the agency account it
--     landed in; statement_account_id is the account whose statement shows it.
--     Positive amounts only, except a reversal: the opposite of one earlier Payment, with
--     its links reversed too. Any User records Payments, on a Trip of any status. A Payment
--     is never edited: until it is Reconciled it can be deleted and entered again, after
--     that only reversed. Only Accountants and Administrators set the reconciliation status,
--     back to Unreconciled too.
--   * payment_links: the part of a Payment that pays one booked Item or Change (Supplier
--     side, that Supplier's, in its booked currency) or settles one Client invoice (Client
--     side). Links never pay more than was booked, or settle more than was invoiced, and
--     never add up to more than the Payment. Any User links and unlinks, at any time.
--   * History for all three.

-- ------------------------------------------------------------- accounts
create table public.payment_accounts (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid references public.clients(id) on delete cascade,   -- empty: the agency's own
  kind       text not null,
  nickname   text not null check (btrim(nickname) <> ''),
  retired_at timestamptz,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint payment_accounts_kind check (
    client_id is null and kind in ('bank', 'card', 'cash')
    or client_id is not null and kind in ('eft', 'card', 'cash'))
);
create unique index payment_accounts_nickname
  on public.payment_accounts (coalesce(client_id, '00000000-0000-0000-0000-000000000000'), lower(btrim(nickname)));
create unique index payment_accounts_one_eft on public.payment_accounts (client_id) where kind = 'eft';

alter table public.payment_accounts enable row level security;
create policy staff_read   on public.payment_accounts for select to authenticated using (true);
create policy admin_insert on public.payment_accounts for insert to authenticated with check (public.is_admin());
create policy admin_update on public.payment_accounts for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Every Client has EFT from the start, existing ones included.
create function public.add_client_eft() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.payment_accounts (client_id, kind, nickname) values (new.id, 'eft', 'EFT');
  return null;
end $$;
create trigger clients_add_eft after insert on public.clients
  for each row execute function public.add_client_eft();
insert into public.payment_accounts (client_id, kind, nickname) select id, 'eft', 'EFT' from public.clients;

-- ------------------------------------------------------------- payments
create table public.payments (
  id                   uuid primary key default gen_random_uuid(),
  trip_id              uuid not null references public.trips(id) on delete restrict,
  side                 text not null check (side in ('supplier', 'client')),
  supplier_id          uuid references public.suppliers(id),
  paid_on              date not null,
  amount               numeric(12, 2) not null,
  currency             text not null default 'ZAR' check (currency ~ '^[A-Z]{3}$'),
  rate                 numeric(14, 6) not null default 1 check (rate > 0),
  rand_amount          numeric(12, 2) generated always as (round(amount * rate, 2)) stored,
  account_id           uuid not null references public.payment_accounts(id),
  landed_account_id    uuid references public.payment_accounts(id),
  statement_account_id uuid generated always as (coalesce(landed_account_id, account_id)) stored,
  status               text not null default 'unreconciled' check (status in ('unreconciled', 'reconciled', 'query')),
  query_reason         text,
  reverses_id          uuid unique references public.payments(id),   -- restrict: a reversed Payment stays
  notes                text,
  created_by           uuid default auth.uid() references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint payments_side check (
    side = 'supplier' and supplier_id is not null
    or side = 'client' and supplier_id is null and currency = 'ZAR'),
  constraint payments_rand_rate check (currency <> 'ZAR' or rate = 1),
  constraint payments_sign check ((reverses_id is null) = (amount > 0)),
  constraint payments_query_reason check (status is distinct from 'query' or btrim(coalesce(query_reason, '')) <> '')
);
create index payments_trip on public.payments (trip_id);
create index payments_statement on public.payments (statement_account_id, paid_on);
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

alter table public.payments enable row level security;
create policy staff_read     on public.payments for select to authenticated using (true);
create policy staff_insert   on public.payments for insert to authenticated with check (true);
create policy accounts_update on public.payments for update to authenticated using (public.is_accounts()) with check (public.is_accounts());
create policy staff_delete   on public.payments for delete to authenticated using (status = 'unreconciled');

-- Accounts that fit the Trip's Client; a reversal copies the Payment it reverses.
create function public.guard_new_payment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o    public.payments;
  acc  public.payment_accounts;
  land public.payment_accounts;
  v_client uuid;
begin
  if new.reverses_id is not null then
    select * into o from public.payments where id = new.reverses_id;
    if o.reverses_id is not null then
      raise exception 'A reversal cannot itself be reversed; enter the Payment again instead.' using errcode = 'check_violation';
    end if;
    new.trip_id := o.trip_id; new.side := o.side; new.supplier_id := o.supplier_id;
    new.amount := -o.amount; new.currency := o.currency; new.rate := o.rate;
    new.account_id := o.account_id; new.landed_account_id := o.landed_account_id;
  else
    select client_id into v_client from public.trips where id = new.trip_id;
    select * into acc from public.payment_accounts where id = new.account_id;
    if acc.retired_at is not null then
      raise exception '% is retired.', acc.nickname using errcode = 'check_violation';
    end if;
    if new.side = 'client' and acc.client_id is distinct from v_client
       or new.side = 'supplier' and acc.client_id is not null and (acc.client_id <> v_client or acc.kind <> 'card') then
      raise exception 'That Payment account is not the agency''s, this Trip''s Client''s, or (to pay a Supplier) one of the Client''s cards.' using errcode = 'check_violation';
    end if;
    if acc.client_id is not null and acc.kind in ('eft', 'cash') then
      select * into land from public.payment_accounts where id = new.landed_account_id;
      if land.id is null or land.client_id is not null or land.kind = 'card' or land.retired_at is not null then
        raise exception 'Say which of the agency''s accounts the % went into.', acc.nickname using errcode = 'check_violation';
      end if;
    elsif new.landed_account_id is not null then
      raise exception 'Only EFT and Cash name the agency account the money landed in.' using errcode = 'check_violation';
    end if;
  end if;
  if auth.uid() is not null then new.status := 'unreconciled'; new.query_reason := null; end if;
  return new;
end $$;
create trigger payments_guard_new before insert on public.payments
  for each row execute function public.guard_new_payment();

-- Only the reconciliation status changes; the rest of a Payment is never edited.
create function public.guard_payment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if (to_jsonb(new) - array['status', 'query_reason', 'updated_at', 'rand_amount', 'statement_account_id'])
     <> (to_jsonb(old) - array['status', 'query_reason', 'updated_at', 'rand_amount', 'statement_account_id']) then
    raise exception 'A Payment is not edited: delete it and enter it again while it is Unreconciled, or reverse it.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger payments_guard before update on public.payments
  for each row execute function public.guard_payment();

-- ---------------------------------------------------------------- links
create table public.payment_links (
  id         uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  trip_id    uuid not null,                                            -- the Payment's, for History
  quote_id   uuid,                                                     -- Supplier side: the booked Item
  entity_id  text,
  change_id  uuid,                                                     -- ... or one of its Changes
  invoice_id uuid references public.invoices(id) on delete restrict,   -- Client side: the Client invoice
  amount     numeric(12, 2) not null check (amount <> 0),
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  foreign key (quote_id, entity_id) references public.item_bookings (quote_id, entity_id) on delete restrict,
  foreign key (change_id, quote_id, entity_id) references public.item_changes (id, quote_id, entity_id) on delete restrict,
  constraint payment_links_target check (
    invoice_id is null and quote_id is not null and entity_id is not null
    or invoice_id is not null and quote_id is null and entity_id is null and change_id is null),
  unique nulls not distinct (payment_id, quote_id, entity_id, change_id, invoice_id)
);
create index payment_links_item on public.payment_links (quote_id, entity_id);
create index payment_links_invoice on public.payment_links (invoice_id);

alter table public.payment_links enable row level security;
create policy staff_read   on public.payment_links for select to authenticated using (true);
create policy staff_insert on public.payment_links for insert to authenticated with check (true);
-- A reversed Payment and its reversal keep their links, or the two would no longer cancel out.
create policy staff_delete on public.payment_links for delete to authenticated using (
  not exists (select 1 from public.payments p where p.id = payment_id and p.reverses_id is not null)
  and not exists (select 1 from public.payments p where p.reverses_id = payment_id));

-- shortcut: two people linking the same Item at the same moment could each pass the cap; lock the target if that ever happens.
create function public.guard_payment_link() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p      public.payments;
  b      public.item_bookings;
  c      public.item_changes;
  inv    public.invoices;
  booked numeric;
  paid   numeric;
begin
  select * into p from public.payments where id = new.payment_id;
  new.trip_id := p.trip_id;
  -- Depth 1 is a User linking; a reversal's own links come from reverse_payment_links().
  if pg_trigger_depth() = 1 and (p.reverses_id is not null or exists (select 1 from public.payments where reverses_id = p.id)) then
    raise exception 'This Payment is reversed; its links stay as they are.' using errcode = 'check_violation';
  end if;
  if sign(new.amount) <> sign(p.amount) then
    raise exception 'A link has the same sign as its Payment.' using errcode = 'check_violation';
  end if;
  if abs(coalesce((select sum(amount) from public.payment_links where payment_id = p.id and id <> new.id), 0) + new.amount) > abs(p.amount) then
    raise exception 'The links would add up to more than the Payment.' using errcode = 'check_violation';
  end if;

  if p.side = 'supplier' then
    if new.invoice_id is not null then
      raise exception 'A Supplier Payment pays booked Items and Changes, not invoices.' using errcode = 'check_violation';
    end if;
    select * into b from public.item_bookings where quote_id = new.quote_id and entity_id = new.entity_id;
    if b.supplier_id is distinct from p.supplier_id
       or not exists (select 1 from public.quotes where id = new.quote_id and trip_id = p.trip_id) then
      raise exception 'A Supplier Payment pays only that Supplier''s bookings on its own Trip.' using errcode = 'check_violation';
    end if;
    if new.change_id is null then
      booked := b.amount;
      if b.currency <> p.currency then
        raise exception 'This was booked in %, but the Payment is in %.', b.currency, p.currency using errcode = 'check_violation';
      end if;
    else
      select * into c from public.item_changes where id = new.change_id;
      booked := c.extra_fare + c.extra_taxes + c.supplier_penalty;
      if c.currency <> p.currency then
        raise exception 'This Change is in %, but the Payment is in %.', c.currency, p.currency using errcode = 'check_violation';
      end if;
    end if;
    select coalesce(sum(amount), 0) + new.amount into paid from public.payment_links
     where quote_id = new.quote_id and entity_id = new.entity_id and change_id is not distinct from new.change_id and id <> new.id;
    if paid > booked then
      raise exception 'That would pay % % for something booked at % %.', p.currency, paid, p.currency, booked using errcode = 'check_violation';
    end if;
  else
    select * into inv from public.invoices where id = new.invoice_id;
    if inv.side is distinct from 'client' or inv.trip_id <> p.trip_id or inv.amount < 0 then
      raise exception 'A Client Payment settles Client invoices on its own Trip (not credit notes).' using errcode = 'check_violation';
    end if;
    select coalesce(sum(amount), 0) + new.amount into paid from public.payment_links where invoice_id = inv.id and id <> new.id;
    if paid > inv.amount then
      raise exception 'That would settle R % of an invoice for R %.', paid, inv.amount using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger payment_links_guard before insert or update on public.payment_links
  for each row execute function public.guard_payment_link();

-- A reversal takes back its Payment's links too.
create function public.reverse_payment_links() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.payment_links (payment_id, trip_id, quote_id, entity_id, change_id, invoice_id, amount)
  select new.id, new.trip_id, quote_id, entity_id, change_id, invoice_id, -amount
    from public.payment_links where payment_id = new.reverses_id;
  return null;
end $$;
create trigger payments_reverse_links after insert on public.payments
  for each row when (new.reverses_id is not null) execute function public.reverse_payment_links();

-- A used account keeps its nickname and kind.
create function public.guard_payment_account() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.nickname, new.kind, new.client_id) is distinct from (old.nickname, old.kind, old.client_id)
     and exists (select 1 from public.payments where account_id = old.id or landed_account_id = old.id) then
    raise exception 'This account has Payments; retire it and add another instead.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger payment_accounts_guard before update on public.payment_accounts
  for each row execute function public.guard_payment_account();

-- ----------------------------------------------------------------- History
do $$
declare t text;
begin
  foreach t in array array['payment_accounts', 'payments', 'payment_links'] loop
    execute format('create trigger %I_history after insert or update or delete on public.%I
                      for each row execute function public.record_history()', t, t);
  end loop;
end $$;
