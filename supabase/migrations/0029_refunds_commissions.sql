-- Refunds and Commissions (GLOSSARY: Payment, Refund, Commission, Cancellation).
-- Run in the Supabase SQL editor after 0028.
--
--   * payments.kind: Paid to Supplier, Received from Client, Refund from Supplier, Refund
--     to Client, Commission from Supplier. Existing Payments take theirs from their side.
--     Amounts stay positive (a reversal is the only negative); a reversal copies the kind.
--   * A Refund lives on its Cancellation (one per Cancellation with a refund expected):
--     status (null is Requested), requested date, Supplier reference and the amount the
--     Supplier approved, in Rand like the refund expected. What came in and went back is
--     summed from Payments in refund_totals.
--   * A Commission lives on its booking, in the booked currency: typed, deducted from the
--     Supplier payment or claimed later (claimed date, reference, due date). What came in
--     is summed from Payments in commission_totals.
--   * Any User, Accountants included, sets Refunds and Commissions, through set_refund()
--     and set_commission() (Accountants edit no booking otherwise).
--   * Payment links by kind: paid to an Item never beyond booked less a deducted
--     Commission; refund in to a Cancellation up to the approved Rand; refund out to a
--     Client credit note up to its amount; commission in to a claimed Commission up to it.

-- ------------------------------------------------------------------ kinds
alter table public.payments add column kind text;
alter table public.payments disable trigger payments_history;
update public.payments set kind = case side when 'supplier' then 'paid' else 'received' end;
alter table public.payments enable trigger payments_history;
alter table public.payments
  alter column kind set not null,
  add constraint payments_kind check (
    side = 'supplier' and kind in ('paid', 'refund_in', 'commission_in')
    or side = 'client' and kind in ('received', 'refund_out'));

-- Replaces the 0027 version: a reversal also copies the kind.
create or replace function public.guard_new_payment() returns trigger
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
    new.trip_id := o.trip_id; new.side := o.side; new.kind := o.kind; new.supplier_id := o.supplier_id;
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

-- ---------------------------------------------------------------- Refunds
alter table public.item_changes
  add column refund_status       text check (refund_status in ('requested', 'approved', 'declined')),
  add column refund_requested_on date,
  add column refund_reference    text,
  add column refund_approved     numeric(12, 2) check (refund_approved >= 0),
  add constraint item_changes_refund check (
    kind = 'cancellation' and expected_refund > 0
    or refund_status is null and refund_requested_on is null and refund_reference is null and refund_approved is null);

-- ------------------------------------------------------------ Commissions
alter table public.item_bookings
  add column commission                 numeric(12, 2) check (commission > 0),
  add column commission_note            text,
  add column commission_deducted        boolean not null default false,
  add column commission_claimed_on      date,
  add column commission_claim_reference text,
  add column commission_due_on          date,
  add constraint item_bookings_commission check (
    commission is not null
    or commission_note is null and not commission_deducted and commission_claimed_on is null
       and commission_claim_reference is null and commission_due_on is null),
  add constraint item_bookings_commission_claim check (
    not commission_deducted
    or commission_claimed_on is null and commission_claim_reference is null and commission_due_on is null);

-- Replaces the 0024 version: Refund and Commission fields stay open to every User after verification.
create or replace function public.guard_verified_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  -- item_bookings has no id; a Change's links name it.
  v_change uuid := case when tg_table_name = 'item_changes' then (to_jsonb(old) ->> 'id')::uuid end;
  v_free text[] := array['no_supplier_invoice', 'issued_at', 'ticket_numbers', 'notes', 'description', 'updated_at',
                         'refund_status', 'refund_requested_on', 'refund_reference', 'refund_approved',
                         'commission', 'commission_note', 'commission_deducted', 'commission_claimed_on',
                         'commission_claim_reference', 'commission_due_on'];
begin
  if auth.uid() is null then return new; end if;
  if new.no_supplier_invoice is distinct from old.no_supplier_invoice and not public.is_accounts() then
    raise exception 'Only an Accountant or Administrator can mark that no supplier invoice is expected.' using errcode = 'insufficient_privilege';
  end if;
  if not public.is_admin()
     and (to_jsonb(new) - v_free) <> (to_jsonb(old) - v_free)
     and exists (select 1 from public.invoice_links l join public.invoices i on i.id = l.invoice_id
                  where l.quote_id = old.quote_id and l.entity_id = old.entity_id
                    and l.change_id is not distinct from v_change
                    and i.side = 'supplier' and i.status = 'verified') then
    raise exception 'A Supplier invoice for this is verified; only an administrator can correct it now.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

-- Rand received for a Refund. Shared by the guards and refund_totals.
create function public.refund_received(p_change_id uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(round(sum(l.amount * p.rate), 2), 0)
    from public.payment_links l join public.payments p on p.id = l.payment_id
   where l.change_id = p_change_id and p.kind = 'refund_in'
$$;

-- Money linked to a booked Item (not its Changes) by Payments of one kind, in the booked currency.
create function public.item_linked(p_quote_id uuid, p_entity_id text, p_kind text) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(l.amount), 0)
    from public.payment_links l join public.payments p on p.id = l.payment_id
   where l.quote_id = p_quote_id and l.entity_id = p_entity_id and l.change_id is null and p.kind = p_kind
$$;

-- A Cancellation's expected refund is not taken away while refund money is linked to it;
-- once none is expected, its Refund goes too.
create function public.guard_refund_correction() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.expected_refund, 0) <= 0 and coalesce(old.expected_refund, 0) > 0 then
    if public.refund_received(old.id) <> 0 then
      raise exception 'This Refund has money received against it.' using errcode = 'check_violation';
    end if;
    new.refund_status := null; new.refund_requested_on := null; new.refund_reference := null; new.refund_approved := null;
  end if;
  return new;
end $$;
create trigger item_changes_refund_correction before update of expected_refund on public.item_changes
  for each row execute function public.guard_refund_correction();

create function public.set_refund(p_change_id uuid, p_status text, p_requested_on date, p_reference text, p_approved numeric)
returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.item_changes;
  v_received numeric;
begin
  if not (public.can_edit() or public.is_accounts()) then
    raise exception 'Not allowed.' using errcode = 'insufficient_privilege';
  end if;
  select * into c from public.item_changes where id = p_change_id;
  if c.id is null or c.kind <> 'cancellation' or coalesce(c.expected_refund, 0) <= 0 then
    raise exception 'Only a Cancellation with a refund expected has a Refund.' using errcode = 'check_violation';
  end if;
  v_received := public.refund_received(c.id);
  if p_status = 'declined' and v_received <> 0 then
    raise exception 'R % has come in for this Refund, so it is not declined; reverse that Payment first.', v_received using errcode = 'check_violation';
  end if;
  if coalesce(p_approved, c.expected_refund) < v_received then
    raise exception 'R % has already come in, more than the R % approved.', v_received, coalesce(p_approved, c.expected_refund) using errcode = 'check_violation';
  end if;
  update public.item_changes
     set refund_status = p_status, refund_requested_on = p_requested_on,
         refund_reference = nullif(btrim(p_reference), ''), refund_approved = p_approved
   where id = c.id;
end $$;
revoke execute on function public.set_refund(uuid, text, date, text, numeric) from public, anon;
grant execute on function public.set_refund(uuid, text, date, text, numeric) to authenticated;

-- p_amount null takes the Commission off.
create function public.set_commission(p_quote_id uuid, p_entity_id text, p_amount numeric, p_note text, p_deducted boolean,
                                      p_claimed_on date, p_reference text, p_due_on date)
returns void
language plpgsql security definer set search_path = public as $$
declare
  b public.item_bookings;
  v_claimed boolean := p_amount is not null and not coalesce(p_deducted, false);
  v_received numeric;
begin
  if not (public.can_edit() or public.is_accounts()) then
    raise exception 'Not allowed.' using errcode = 'insufficient_privilege';
  end if;
  select * into b from public.item_bookings where quote_id = p_quote_id and entity_id = p_entity_id;
  if b.quote_id is null then
    raise exception 'Only a booked Item has a Commission.' using errcode = 'check_violation';
  end if;
  if p_amount is not null and p_amount <= 0 then
    raise exception 'A Commission is above 0; clear it to take it off.' using errcode = 'check_violation';
  end if;
  v_received := public.item_linked(p_quote_id, p_entity_id, 'commission_in');
  if v_received <> 0 and not v_claimed then
    raise exception '% % of this Commission has come in, so it stays claimed.', b.currency, v_received using errcode = 'check_violation';
  end if;
  if p_amount < v_received then
    raise exception '% % has already come in, more than a Commission of % %.', b.currency, v_received, b.currency, p_amount using errcode = 'check_violation';
  end if;
  if p_amount is not null and p_deducted then
    if p_amount > b.amount then
      raise exception 'A deducted Commission cannot be more than the % % booked.', b.currency, b.amount using errcode = 'check_violation';
    end if;
    if public.item_linked(p_quote_id, p_entity_id, 'paid') > b.amount - p_amount then
      raise exception 'The Supplier has already been paid more than % % less this Commission.', b.currency, b.amount using errcode = 'check_violation';
    end if;
  end if;
  update public.item_bookings
     set commission = p_amount,
         commission_note = case when p_amount is not null then nullif(btrim(p_note), '') end,
         commission_deducted = p_amount is not null and coalesce(p_deducted, false),
         commission_claimed_on = case when v_claimed then p_claimed_on end,
         commission_claim_reference = case when v_claimed then nullif(btrim(p_reference), '') end,
         commission_due_on = case when v_claimed then p_due_on end
   where quote_id = p_quote_id and entity_id = p_entity_id;
end $$;
revoke execute on function public.set_commission(uuid, text, numeric, text, boolean, date, text, date) from public, anon;
grant execute on function public.set_commission(uuid, text, numeric, text, boolean, date, text, date) to authenticated;

-- ------------------------------------------------------------------ links
-- Replaces the 0027 version: what a link may point at, and how far, depends on the Payment's kind.
-- Links are only inserted and deleted (no update policy), so a new link is never in the sums yet.
-- shortcut: two people linking the same Item at the same moment could each pass the cap; lock the target if that ever happens.
create or replace function public.guard_payment_link() returns trigger
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
      raise exception 'A Supplier Payment goes against booked Items and Changes, not invoices.' using errcode = 'check_violation';
    end if;
    select * into b from public.item_bookings where quote_id = new.quote_id and entity_id = new.entity_id;
    if b.supplier_id is distinct from p.supplier_id
       or not exists (select 1 from public.quotes where id = new.quote_id and trip_id = p.trip_id) then
      raise exception 'A Supplier Payment goes only against that Supplier''s bookings on its own Trip.' using errcode = 'check_violation';
    end if;
    if new.change_id is not null then
      select * into c from public.item_changes where id = new.change_id;
    end if;

    if p.kind = 'paid' then
      if new.change_id is null then
        booked := b.amount - case when b.commission_deducted then b.commission else 0 end;
        if b.currency <> p.currency then
          raise exception 'This was booked in %, but the Payment is in %.', b.currency, p.currency using errcode = 'check_violation';
        end if;
      else
        booked := c.extra_fare + c.extra_taxes + c.supplier_penalty;
        if c.currency <> p.currency then
          raise exception 'This Change is in %, but the Payment is in %.', c.currency, p.currency using errcode = 'check_violation';
        end if;
      end if;
      select coalesce(sum(l.amount), 0) + new.amount into paid
        from public.payment_links l join public.payments lp on lp.id = l.payment_id
       where l.quote_id = new.quote_id and l.entity_id = new.entity_id and l.change_id is not distinct from new.change_id
         and lp.kind = 'paid' and l.id <> new.id;
      if paid > booked then
        raise exception 'That would pay % % for something booked at % %.', p.currency, paid, p.currency, booked using errcode = 'check_violation';
      end if;

    elsif p.kind = 'refund_in' then
      if c.id is null or c.kind <> 'cancellation' or coalesce(c.expected_refund, 0) <= 0 then
        raise exception 'A refund from a Supplier goes against the Cancellation it refunds.' using errcode = 'check_violation';
      end if;
      if c.refund_status = 'declined' and new.amount > 0 then
        raise exception 'This Refund was declined.' using errcode = 'check_violation';
      end if;
      paid := public.refund_received(c.id) + round(new.amount * p.rate, 2);
      if paid > coalesce(c.refund_approved, c.expected_refund) then
        raise exception 'That would make R % received for a Refund of R %.', paid, coalesce(c.refund_approved, c.expected_refund) using errcode = 'check_violation';
      end if;

    else -- commission_in
      if new.change_id is not null or b.commission is null or b.commission_deducted then
        raise exception 'Commission from a Supplier goes against a booked Item with a claimed Commission.' using errcode = 'check_violation';
      end if;
      if b.currency <> p.currency then
        raise exception 'This Commission is in %, but the Payment is in %.', b.currency, p.currency using errcode = 'check_violation';
      end if;
      paid := public.item_linked(new.quote_id, new.entity_id, 'commission_in') + new.amount;
      if paid > b.commission then
        raise exception 'That would make % % received for a Commission of % %.', p.currency, paid, p.currency, b.commission using errcode = 'check_violation';
      end if;
    end if;

  else
    select * into inv from public.invoices where id = new.invoice_id;
    if inv.side is distinct from 'client' or inv.trip_id <> p.trip_id then
      raise exception 'A Client Payment goes against a Client invoice or credit note on its own Trip.' using errcode = 'check_violation';
    end if;
    if p.kind = 'received' and inv.amount < 0 then
      raise exception 'A Payment from the Client settles invoices, not credit notes.' using errcode = 'check_violation';
    end if;
    if p.kind = 'refund_out' and inv.amount > 0 then
      raise exception 'A refund to the Client goes against a credit note.' using errcode = 'check_violation';
    end if;
    select coalesce(sum(amount), 0) + new.amount into paid from public.payment_links where invoice_id = inv.id and id <> new.id;
    if paid > abs(inv.amount) then
      raise exception 'That would settle R % of R %.', paid, abs(inv.amount) using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

-- ------------------------------------------------------------------ totals
-- One row per Refund: approved, received and paid back, all in Rand.
-- Paid back: each credit note's refund-out money, shared by what it credits for this Cancellation.
create view public.refund_totals with (security_invoker = true) as
select q.trip_id, c.quote_id, c.entity_id, c.id as change_id, b.supplier_id, c.happened_on,
       c.refund_status, c.refund_requested_on, c.refund_reference, c.expected_refund,
       coalesce(c.refund_approved, c.expected_refund) as approved, c.agency_fee,
       public.refund_received(c.id) as received,
       coalesce((
         select round(sum(cl.amount / n.amount * (
                  select coalesce(sum(pl.amount), 0) from public.payment_links pl join public.payments pp on pp.id = pl.payment_id
                   where pl.invoice_id = n.id and pp.kind = 'refund_out')), 2)
           from public.invoice_links cl join public.invoices n on n.id = cl.invoice_id
          where cl.change_id = c.id and n.side = 'client' and n.amount < 0), 0) as paid_back
  from public.item_changes c
  join public.item_bookings b using (quote_id, entity_id)
  join public.quotes q on q.id = c.quote_id
 where c.kind = 'cancellation' and c.expected_refund > 0;

-- One row per Commission, received in the booked currency.
create view public.commission_totals with (security_invoker = true) as
select q.trip_id, b.quote_id, b.entity_id, b.supplier_id, b.currency, b.commission, b.commission_note,
       b.commission_deducted, b.commission_claimed_on, b.commission_claim_reference, b.commission_due_on,
       public.item_linked(b.quote_id, b.entity_id, 'commission_in') as received
  from public.item_bookings b
  join public.quotes q on q.id = b.quote_id
 where b.commission is not null;

grant select on public.refund_totals, public.commission_totals to authenticated;
revoke execute on function public.refund_received(uuid), public.item_linked(uuid, text, text) from public, anon;
grant execute on function public.refund_received(uuid), public.item_linked(uuid, text, text) to authenticated;
