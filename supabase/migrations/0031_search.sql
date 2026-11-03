-- One search over references, Clients, Travellers, bookings and invoices (milestone 14).
-- Run in the Supabase SQL editor after 0030.
--
--   * search(q): case-insensitive "contains" on Trip reference and title, Client code and
--     name, Traveller name, Booking reference, ticket numbers, Commission claim reference,
--     Refund reference and Supplier and Client invoice numbers. Under 2 characters finds
--     nothing. ID and Passport numbers are never searched (POPIA, docs/adr/0010).
--   * It runs with the caller's rights, so it finds only what they could read anyway.
--   * One row per match; a booking matching on two tickets is two rows. The app groups
--     them as Trips, Clients, Travellers, Bookings (Refunds and Commissions too) and Invoices.

create function public.search(p_q text)
returns table (grp text, trip_id uuid, client_id uuid, reference text, name text, kind text, matched text)
language sql stable set search_path = public as $$
  with q as (select lower(btrim(p_q)) as s where length(btrim(p_q)) >= 2),
  trip as (select t.id, t.client_id, t.reference, c.full_name from public.trips t join public.clients c on c.id = t.client_id)
  select 'trip', t.id, c.id, t.reference, c.full_name, null, t.title
    from public.trips t join public.clients c on c.id = t.client_id, q
   where strpos(lower(t.reference), q.s) > 0 or strpos(lower(coalesce(t.title, '')), q.s) > 0
  union all
  select 'client', null, c.id, c.client_code, c.full_name, null, null
    from public.clients c, q
   where strpos(lower(c.client_code), q.s) > 0 or strpos(lower(c.full_name), q.s) > 0
  union all
  select 'traveller', null, c.id, c.client_code, v.first_name || ' ' || v.last_name, null, c.full_name
    from public.travellers v join public.clients c on c.id = v.client_id, q
   where strpos(lower(v.first_name || ' ' || v.last_name), q.s) > 0
  union all
  select 'booking', t.id, t.client_id, t.reference, t.full_name, b.kind, m.what
    from public.item_bookings b join public.quotes qu on qu.id = b.quote_id join trip t on t.id = qu.trip_id, q,
         lateral (select 'Booking reference ' || b.booking_reference where strpos(lower(b.booking_reference), q.s) > 0
                  union all
                  select 'Ticket ' || n from unnest(b.ticket_numbers) n where strpos(lower(n), q.s) > 0
                  union all
                  select 'Commission claim ' || b.commission_claim_reference
                   where strpos(lower(coalesce(b.commission_claim_reference, '')), q.s) > 0) m(what)
  union all
  select 'booking', t.id, t.client_id, t.reference, t.full_name, b.kind, 'Refund reference ' || ch.refund_reference
    from public.item_changes ch join public.item_bookings b using (quote_id, entity_id)
         join public.quotes qu on qu.id = ch.quote_id join trip t on t.id = qu.trip_id, q
   where strpos(lower(coalesce(ch.refund_reference, '')), q.s) > 0
  union all
  select 'invoice', t.id, t.client_id, t.reference, t.full_name, null,
         case i.side when 'supplier' then 'Supplier invoice ' else 'Client invoice ' end || i.number || coalesce(' (' || s.name || ')', '')
    from public.invoices i join trip t on t.id = i.trip_id left join public.suppliers s on s.id = i.supplier_id, q
   where strpos(lower(i.number), q.s) > 0
   order by 1, 4, 7
$$;
revoke execute on function public.search(text) from public, anon;
grant execute on function public.search(text) to authenticated;
