-- Administrators correct, remove and merge Destinations (GLOSSARY: Destination, ADR 0014).
-- Run in the Supabase SQL editor after 0033.
--
--   * Stays already let every editor update them, so a rename or merge can rewrite their copied name and code.
--   * A Destination a Stay still points at cannot be deleted (the trip_stops foreign key); merge it instead.
--   * Changes are already in the history (0021).

create policy admin_update on public.destinations for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy admin_delete on public.destinations for delete to authenticated
  using (public.is_admin());
