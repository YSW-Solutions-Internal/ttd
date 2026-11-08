-- Premium economy fare type (international flights only, like the others).
-- Charged the same as Business / first for now: each schedule's 'premium' rows are copied,
-- so Clients' own schedules keep their own amounts.

alter table public.fee_rates
  drop constraint fee_rates_variant_check,
  add constraint fee_rates_variant_check check (variant in (
    '', 'premium', 'premium_economy', 'side_ticket',
    'preseat', 'baggage', 'after_hours', 'meet_greet', 'conference', 'report_mis', 'report_adhoc'));

alter table public.flight_options
  drop constraint flight_options_variant_check,
  add constraint flight_options_variant_check check (variant in ('', 'premium', 'premium_economy', 'side_ticket'));

insert into public.fee_rates (schedule_id, kind, fee_region, variant, transaction_fee, change_fee, refund_fee, prepayment_fee)
select schedule_id, kind, fee_region, 'premium_economy', transaction_fee, change_fee, refund_fee, prepayment_fee
  from public.fee_rates
 where kind = 'flight' and variant = 'premium';
