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
