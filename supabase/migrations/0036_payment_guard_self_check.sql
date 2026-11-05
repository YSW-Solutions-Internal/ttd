-- Self-check for the Payment link guard (guard_payment_link, migrations 0027 and 0029).
-- Run in the Supabase SQL editor after 0035. Changes nothing: it builds a Client, Trip, booked
-- Extra and Payments, checks what the guard lets through, then rolls all of it back.
-- Run it again after any migration that touches Payments, links or bookings.
-- The SQL editor hides notices: "Success. No rows returned" means it passed; a failed check is an error.

do $$
declare
  me    uuid := (select id from public.profiles where role in ('user', 'admin') limit 1);
  cl    uuid;
  tr    uuid;
  qu    uuid;
  sup   uuid;
  other uuid;
  bank  uuid;
  p1    uuid;
  p2    uuid;
  p3    uuid;
  p4    uuid;
begin
  if me is null then
    raise notice 'Payment guard self-check skipped: there is no Standard user or Administrator yet.';
    return;
  end if;

  begin
    insert into public.clients (first_name, last_name, created_by, consultant_id)
      values ('Self', 'Check', me, me) returning id into cl;
    insert into public.trips (client_id, created_by) values (cl, me) returning id into tr;
    select id into qu from public.quotes where trip_id = tr;
    insert into public.suppliers (name) values ('Self-check Supplier ' || gen_random_uuid()) returning id into sup;
    insert into public.suppliers (name) values ('Self-check Other ' || gen_random_uuid()) returning id into other;
    insert into public.payment_accounts (kind, nickname) values ('bank', 'Self-check ' || gen_random_uuid()) returning id into bank;

    -- An Extra booked with the Supplier for R 100.
    insert into public.extras (quote_id, entity_id, price, transaction_fee) values (qu, 'extra_selfchk', 100, 0);
    insert into public.item_bookings (quote_id, entity_id, kind, supplier_id, booking_reference, currency, amount, expected_invoice_on)
      values (qu, 'extra_selfchk', 'extra', sup, 'SELF-CHECK', 'ZAR', 100, current_date);

    insert into public.payments (trip_id, side, kind, supplier_id, paid_on, amount, account_id)
      values (tr, 'supplier', 'paid', sup, current_date, 80, bank) returning id into p1;
    insert into public.payments (trip_id, side, kind, supplier_id, paid_on, amount, account_id)
      values (tr, 'supplier', 'paid', sup, current_date, 50, bank) returning id into p2;
    insert into public.payments (trip_id, side, kind, supplier_id, paid_on, amount, currency, rate, account_id)
      values (tr, 'supplier', 'paid', sup, current_date, 10, 'USD', 18, bank) returning id into p3;
    insert into public.payments (trip_id, side, kind, supplier_id, paid_on, amount, account_id)
      values (tr, 'supplier', 'paid', other, current_date, 5, bank) returning id into p4;

    -- Allowed: R 80 of R 100.
    insert into public.payment_links (payment_id, quote_id, entity_id, amount) values (p1, qu, 'extra_selfchk', 80);

    -- Refused: R 30 more would pay R 110 for R 100 booked.
    begin
      insert into public.payment_links (payment_id, quote_id, entity_id, amount) values (p2, qu, 'extra_selfchk', 30);
      raise exception 'self-check: paying more than was booked was allowed' using errcode = 'P0004';
    exception when check_violation then null;
    end;

    -- Refused: R 60 of a R 50 Payment.
    begin
      insert into public.payment_links (payment_id, quote_id, entity_id, amount) values (p2, qu, 'extra_selfchk', 60);
      raise exception 'self-check: a link bigger than its Payment was allowed' using errcode = 'P0004';
    exception when check_violation then null;
    end;

    -- Allowed: R 20 more makes exactly R 100.
    insert into public.payment_links (payment_id, quote_id, entity_id, amount) values (p2, qu, 'extra_selfchk', 20);

    -- Refused: a USD Payment against a Rand booking.
    begin
      insert into public.payment_links (payment_id, quote_id, entity_id, amount) values (p3, qu, 'extra_selfchk', 10);
      raise exception 'self-check: a Payment in another currency was allowed' using errcode = 'P0004';
    exception when check_violation then null;
    end;

    -- Refused: another Supplier's Payment.
    begin
      insert into public.payment_links (payment_id, quote_id, entity_id, amount) values (p4, qu, 'extra_selfchk', 5);
      raise exception 'self-check: another Supplier''s Payment was allowed' using errcode = 'P0004';
    exception when check_violation then null;
    end;

    raise notice 'Payment guard self-check passed.';
    -- Undo everything above; only this code is caught, so a failed check still stops the run.
    raise exception 'roll back the self-check' using errcode = 'ZZ001';
  exception when sqlstate 'ZZ001' then null;
  end;
end $$;
