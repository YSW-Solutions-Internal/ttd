-- traveller_flags becomes a function (Supabase's advisor flags owner-rights views).
-- Run in the Supabase SQL editor after 0027.
--
--   * Same answer as the 0022 view: for one Client, whether each Traveller has an ID or
--     Passport, without showing what. It still runs with its owner's rights, on purpose:
--     identity_documents is hidden from all but the Consultant and Administrators, and
--     every User needs the flag.

drop view public.traveller_flags;

create function public.traveller_flags(p_client_id uuid)
returns table (traveller_id uuid, identified boolean)
language sql stable security definer set search_path = public as $$
  select t.id, exists (select 1 from public.identity_documents d where d.traveller_id = t.id)
    from public.travellers t
   where t.client_id = p_client_id
$$;
revoke execute on function public.traveller_flags(uuid) from public, anon;
grant execute on function public.traveller_flags(uuid) to authenticated;
