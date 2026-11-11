-- Self-check for the Refund, Commission and Verify guards (guard_refund, guard_commission,
-- check_verifiable; migrations 0024 and 0029), like 0036 for Payment links.
-- Run in the Supabase SQL editor after 0036. Changes nothing: it builds a Client, Trip, two booked
-- Extras, a Cancellation, Payments and Supplier invoices, checks what the guards let through, then
-- rolls all of it back. Run it again after any migration that touches bookings, Changes,
-- Refunds, Commissions or invoices.
-- The SQL editor hides notices: "Success. No rows returned" means it passed; a failed check is an error.

do $$
declare
  me    uuid := (select id from public.profiles where role in ('user', 'admin') limit 1);
  cl    uuid;
  tr    uuid;
  qu    uuid;
  sup   uuid;
  bank  uuid;
  canc  uuid;
  p     uuid;
  inv   public.invoices;
begin
  if me is null then
    raise notice 'Money guards self-check skipped: there is no Standard user or Administrator yet.';
    return;
  end if;

  begin
    insert into public.clients (first_name, last_name, created_by, consultant_id)
      values ('Self', 'Check', me, me) returning id into cl;
    insert into public.trips (client_id, created_by) values (cl, me) returning id into tr;
    select id into qu from public.quotes where trip_id = tr;
    insert into public.suppliers (name) values ('Self-check Supplier ' || gen_random_uuid()) returning id into sup;
    insert into public.payment_accounts (kind, nickname) values ('bank', 'Self-check ' || gen_random_uuid()) returning id into bank;

    -- Two Extras, each booked with the Supplier for R 100.
    insert into public.extras (quote_id, entity_id, price, transaction_fee)
      values (qu, 'extra_selfchk1', 100, 0), (qu, 'extra_selfchk2', 100, 0);
    insert into public.item_bookings (quote_id, entity_id, kind, supplier_id, booking_reference, currency, amount, expected_invoice_on)
      values (qu, 'extra_selfchk1', 'extra', sup, 'SELF-CHECK-1', 'ZAR', 100, current_date),
             (qu, 'extra_selfchk2', 'extra', sup, 'SELF-CHECK-2', 'ZAR', 100, current_date);

    -- ------------------------------------------------------------ Commission
    -- A claimed Commission of R 20 on the first, R 15 of it received.
    update public.item_bookings set commission = 20 where quote_id = qu and entity_id = 'extra_selfchk1';
    insert into public.payments (trip_id, side, kind, supplier_id, paid_on, amount, account_id)
      values (tr, 'supplier', 'commission_in', sup, current_date, 15, bank) returning id into p;
    insert into public.payment_links (payment_id, quote_id, entity_id, amount) values (p, qu, 'extra_selfchk1', 15);

    -- Refused: a Commission below what has come in.
    begin
      update public.item_bookings set commission = 10 where quote_id = qu and entity_id = 'extra_selfchk1';
      raise exception 'self-check: a Commission below what came in was allowed' using errcode = 'P0004';
    exception when check_violation then null;
    end;

    -- Refused: taking the Commission off once money has come in.
    begin
      update public.item_bookings set commission = null where quote_id = qu and entity_id = 'extra_selfchk1';
      raise exception 'self-check: a Commission with money in was taken off' using errcode = 'P0004';
    exception when check_violation then null;
    end;

    -- Refused: marking it deducted once money has come in.
    begin
      update public.item_bookings set commission_deducted = true where quote_id = qu and entity_id = 'extra_selfchk1';
      raise exception 'self-check: a Commission with money in became deducted' using errcode = 'P0004';
    exception when check_violation then null;
    end;

    -- The second: R 90 paid to the Supplier.
    insert into public.payments (trip_id, side, kind, supplier_id, paid_on, amount, account_id)
      values (tr, 'supplier', 'paid', sup, current_date, 90, bank) returning id into p;
    insert into public.payment_links (payment_id, quote_id, entity_id, amount) values (p, qu, 'extra_selfchk2', 90);

    -- Refused: a deducted R 20 would leave the Supplier paid R 90 for R 80.
    begin
      update public.item_bookings set commission = 20, commission_deducted = true where quote_id = qu and entity_id = 'extra_selfchk2';
      raise exception 'self-check: a deducted Commission left the Supplier overpaid' using errcode = 'P0004';
    exception when check_violation then null;
    end;

    -- Refused: a deducted Commission above the booked amount.
    begin
      update public.item_bookings set commission = 150, commission_deducted = true where quote_id = qu and entity_id = 'extra_selfchk2';
      raise exception 'self-check: a deducted Commission above the booking was allowed' using errcode = 'P0004';
    exception when check_violation then null;
    end;

    -- Allowed: a deducted R 10 leaves exactly R 90 to pay.
    update public.item_bookings set commission = 10, commission_deducted = true where quote_id = qu and entity_id = 'extra_selfchk2';

    -- ---------------------------------------------------------------- Refund
    -- The first is cancelled with R 50 expected back, and R 30 has come in.
    insert into public.item_changes (quote_id, entity_id, kind, expected_refund)
      values (qu, 'extra_selfchk1', 'cancellation', 50) returning id into canc;
    insert into public.payments (trip_id, side, kind, supplier_id, paid_on, amount, account_id)
      values (tr, 'supplier', 'refund_in', sup, current_date, 30, bank) returning id into p;
    insert into public.payment_links (payment_id, quote_id, entity_id, change_id, amount) values (p, qu, 'extra_selfchk1', canc, 30);

    -- Refused: Declined once money has come in.
    begin
      update public.item_changes set refund_status = 'declined' where id = canc;
      raise exception 'self-check: a Refund with money in was declined' using errcode = 'P0004';
    exception when check_violation then null;
    end;

    -- Refused: approving less than has come in.
    begin
      update public.item_changes set refund_approved = 20 where id = canc;
      raise exception 'self-check: a Refund approved below what came in was allowed' using errcode = 'P0004';
    exception when check_violation then null;
    end;

    -- Refused: no refund expected any more once money has come in.
    begin
      update public.item_changes set expected_refund = 0 where id = canc;
      raise exception 'self-check: a Refund with money in stopped being expected' using errcode = 'P0004';
    exception when check_violation then null;
    end;

    -- Allowed: approving exactly what came in.
    update public.item_changes set refund_status = 'approved', refund_approved = 30 where id = canc;

    -- ---------------------------------------------------------------- Verify
    -- An invoice for R 100 linked in full to the second booking (R 100) verifies.
    insert into public.invoices (trip_id, side, supplier_id, number, issued_on, amount, file_path, status)
      values (tr, 'supplier', sup, 'SELF-CHECK-A', current_date, 100, 'self-check.pdf', 'received') returning * into inv;
    insert into public.invoice_links (invoice_id, quote_id, entity_id, amount) values (inv.id, qu, 'extra_selfchk2', 100);
    perform public.check_verifiable(inv);

    -- Refused: an invoice whose links do not add up to it.
    insert into public.invoices (trip_id, side, supplier_id, number, issued_on, amount, file_path, status)
      values (tr, 'supplier', sup, 'SELF-CHECK-B', current_date, 100, 'self-check.pdf', 'received') returning * into inv;
    insert into public.invoice_links (invoice_id, quote_id, entity_id, amount) values (inv.id, qu, 'extra_selfchk1', 60);
    begin
      perform public.check_verifiable(inv);
      raise exception 'self-check: an invoice not fully linked was verifiable' using errcode = 'P0004';
    exception when check_violation then null;
    end;

    -- Refused: invoicing R 120 for something booked at R 100.
    insert into public.invoices (trip_id, side, supplier_id, number, issued_on, amount, file_path, status)
      values (tr, 'supplier', sup, 'SELF-CHECK-C', current_date, 120, 'self-check.pdf', 'received') returning * into inv;
    insert into public.invoice_links (invoice_id, quote_id, entity_id, amount) values (inv.id, qu, 'extra_selfchk1', 120);
    begin
      perform public.check_verifiable(inv);
      raise exception 'self-check: invoicing more than was booked was verifiable' using errcode = 'P0004';
    exception when check_violation then null;
    end;

    raise notice 'Money guards self-check passed.';
    -- Undo everything above; only this code is caught, so a failed check still stops the run.
    raise exception 'roll back the self-check' using errcode = 'ZZ001';
  exception when sqlstate 'ZZ001' then null;
  end;
end $$;
