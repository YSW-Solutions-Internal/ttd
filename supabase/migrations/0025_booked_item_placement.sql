-- Placing a booked Accommodation option in a Stay is not a change to its prices.
-- Run in the Supabase SQL editor after 0024.
--
--   * Deleting a Stay unplaces its options (on delete set null, 0010). A booked one could
--     then be placed again only by an Administrator, and Generate version refuses while
--     any option is unplaced. Now any User but an Accountant may change stay_id alone on
--     a booked Item; anything else about it stays locked (0023).

-- Same as 0023, plus the stay_id-only case.
create or replace function public.guard_booked_item() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
  q uuid;
  e text;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  if pg_trigger_depth() > 1 or auth.uid() is null then return r; end if;
  if tg_table_name = 'flights' then
    select o.quote_id, o.entity_id into q, e from public.flight_options o where o.id = r.flight_option_id;
  else
    q := old.quote_id; e := old.entity_id;
  end if;
  if exists (select 1 from public.item_bookings where quote_id = q and entity_id = e) then
    if tg_op = 'DELETE' and tg_table_name <> 'flights' then
      raise exception 'This Item is booked. Unbook it before deleting it.' using errcode = 'insufficient_privilege';
    elsif tg_op = 'UPDATE' and tg_table_name = 'accommodation_options' and public.can_edit()
          and to_jsonb(new) - array['stay_id', 'updated_at'] = to_jsonb(old) - array['stay_id', 'updated_at'] then
      return r;
    elsif not public.is_admin() then
      raise exception 'This Item is booked; only an administrator can correct it.' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return r;
end $$;
