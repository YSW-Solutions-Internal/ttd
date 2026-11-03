-- Nothing with money on it can be deleted (milestone 14).
-- Run in the Supabase SQL editor after 0031.
--
--   * Quotes, Trips, Versions, images and Changes are no longer deleted through the API,
--     by anyone. A Quote took its bookings, Items and sent Versions with it, an image its
--     Items (booked ones too: guard_booked_item lets cascades through), and a Change its
--     amounts and Refund. The app never deleted any of them; the image purge (service key)
--     and test-data clean-up in this editor skip these policies and still work.
--   * Unbooking is refused while a Commission is entered: clear it first. Links to
--     invoices, Payments and Changes already refuse it (0024, 0027).
--   * Still deleted on purpose: a Payment until it is Reconciled and an invoice until it
--     is Verified (delete and enter again), and unbooking an Item booked by mistake.

drop policy admin_delete on public.quotes;
drop policy admin_delete on public.trips;
drop policy admin_delete on public.quote_versions;
drop policy admin_delete on public.images;
drop policy admin_delete on public.item_changes;

create function public.guard_unbook_commission() returns trigger
language plpgsql set search_path = public as $$
begin
  if pg_trigger_depth() > 1 or auth.uid() is null then return old; end if;   -- the SQL editor and service key are trusted
  if old.commission is not null then
    raise exception 'This Item has a Commission entered. Clear the Commission before unbooking.' using errcode = 'check_violation';
  end if;
  return old;
end $$;
create trigger item_bookings_unbook_commission before delete on public.item_bookings
  for each row execute function public.guard_unbook_commission();
