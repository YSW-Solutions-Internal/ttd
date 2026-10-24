-- TTD quoting app: migration 0008.
-- Run in the Supabase SQL editor after 0007.
--
-- The fee grid from "Fee Schedule.xlsx": for each kind of Item, Fee region and
-- (flights only) variant, the four fees an Item can carry. Amounts INCLUDE VAT,
-- unlike fee_schedule_lines (each one is the 0004 sheet amount x 1.15).
--
-- It replaces the 0004 lines it covers (air, hotel, car, transfer, rail and the
-- "cancellation booked but not issued" rule, which is now just the Transaction
-- fee). The other 0004 lines (insurance, visas, seating, after hours, reporting)
-- stay as they are until their milestone.
--
-- Fee regions:
--   domestic             South Africa
--   neighbouring         Mozambique, Botswana, Zimbabwe, Namibia, Eswatini (Swaziland), Lesotho, Zambia
--   local_international  flights only: every airport in one other country
--   international        anywhere else
-- Variants (international flights only): '' economy, 'premium' business or first,
-- 'side_ticket' an internal side ticket, chosen by the Consultant, never worked out.

create table public.fee_rates (
  schedule_id      uuid not null references public.fee_schedules(id) on delete cascade,
  kind             text not null check (kind in ('flight', 'hotel', 'car_rental', 'excursion', 'transfer', 'rail')),
  fee_region       text not null check (fee_region in ('domestic', 'neighbouring', 'local_international', 'international')),
  variant          text not null default '' check (variant in ('', 'premium', 'side_ticket')),
  transaction_fee  numeric(12, 2) not null,   -- added to the Item total; also charged if cancelled before issue
  change_fee       numeric(12, 2) not null,   -- shown on the Quote, not added
  refund_fee       numeric(12, 2) not null,   -- shown on the Quote, not added
  prepayment_fee   numeric(12, 2) not null,   -- added only when the Item is prepaid
  primary key (schedule_id, kind, fee_region, variant)
);

alter table public.fee_rates enable row level security;

-- Same rules as fee_schedule_lines: readable when the schedule is, only admins change.
create policy staff_read on public.fee_rates for select to authenticated
  using (exists (select 1 from public.fee_schedules s where s.id = schedule_id));
create policy admin_write on public.fee_rates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

do $$
declare sid uuid;
begin
  select id into sid from public.fee_schedules
   where name = 'Ore and Metal - Current 2025' and client_id is null;
  if sid is null then
    raise exception 'The standard fee schedule from 0004 is missing. Run 0004 first.';
  end if;

  insert into public.fee_rates (schedule_id, kind, fee_region, variant, transaction_fee, change_fee, refund_fee, prepayment_fee)
  select sid, v.* from (values
    ('flight',     'domestic',            '',            437.00,  437.00,  538.20,   0.00),
    ('flight',     'neighbouring',        '',            747.50,  747.50,  747.50,   0.00),
    ('flight',     'local_international', '',            747.50,  747.50,  747.50,   0.00),
    ('flight',     'international',       '',           1690.50, 1690.50,  948.75,   0.00),
    ('flight',     'international',       'premium',    2323.00, 1690.50,  948.75,   0.00),
    ('flight',     'international',       'side_ticket', 747.50, 1690.50,  948.75,   0.00),
    ('hotel',      'domestic',            '',            230.00,    0.00,  556.60, 556.60),
    ('hotel',      'neighbouring',        '',            345.00,    0.00,  556.60, 556.60),
    ('hotel',      'international',       '',            345.00,    0.00,  556.60, 556.60),
    ('car_rental', 'domestic',            '',            230.00,    0.00,  586.50, 556.60),
    ('car_rental', 'neighbouring',        '',            345.00,    0.00,  586.50, 556.60),
    ('car_rental', 'international',       '',            345.00,    0.00,  586.50, 556.60),
    ('transfer',   'domestic',            '',            230.00,    0.00,    0.00, 287.50),
    ('transfer',   'neighbouring',        '',            345.00,    0.00,    0.00, 345.00),
    ('transfer',   'international',       '',            345.00,    0.00,    0.00, 345.00),
    ('rail',       'domestic',            '',            345.00,    0.00,    0.00,   0.00),
    ('rail',       'neighbouring',        '',            345.00,    0.00,    0.00,   0.00),
    ('rail',       'international',       '',            345.00,    0.00,    0.00,   0.00),
    ('excursion',  'domestic',            '',              0.00,    0.00,    0.00,   0.00),
    ('excursion',  'neighbouring',        '',              0.00,    0.00,    0.00,   0.00),
    ('excursion',  'international',       '',              0.00,    0.00,    0.00,   0.00)
  ) as v(kind, fee_region, variant, transaction_fee, change_fee, refund_fee, prepayment_fee);

  delete from public.fee_schedule_lines
   where schedule_id = sid
     and (section in ('Domestic air', 'International air', 'Hotel reservations', 'Car hire / chauffeur drive', 'Transfers')
          or section like 'Neighbouring countries air%'
          or section like 'Local air%'
          or code in ('rail_reservation', 'cancel_unissued'));
end $$;
