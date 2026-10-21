-- Tightens access after the 0005 review.
-- Run in the Supabase SQL editor after 0005. Safe to read top to bottom: each
-- section is one rule.

-- ----------------------------------------------- business records: no deletes
-- Staff read, add and edit; only admins delete. Line items inside a quote or
-- trip (trip_stops, version_items, version_images, overrides, manual_items,
-- item_bookings) stay fully editable, since removing them is normal editing.
do $$
declare t text;
begin
  foreach t in array array['quotes', 'quote_versions', 'images', 'extractions',
                           'clients', 'client_documents', 'trips'] loop
    execute format('drop policy staff_all on public.%I', t);
    execute format('create policy staff_read on public.%I for select to authenticated using (true)', t);
    execute format('create policy staff_insert on public.%I for insert to authenticated with check (true)', t);
    execute format('create policy staff_update on public.%I for update to authenticated using (true) with check (true)', t);
    execute format('create policy admin_delete on public.%I for delete to authenticated using (public.is_admin())', t);
  end loop;

  -- Pricing and reference settings: staff read, only admins change.
  foreach t in array array['fee_schedules', 'fee_schedule_lines', 'ref_prefixes'] loop
    execute format('drop policy staff_all on public.%I', t);
    execute format('create policy staff_read on public.%I for select to authenticated using (true)', t);
    execute format('create policy admin_write on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- ---------------------------------------------------------- stored files
-- Staff read and upload; only admins overwrite or delete.
drop policy quote_files_rw on storage.objects;
drop policy client_files_rw on storage.objects;

create policy staff_files_read on storage.objects for select to authenticated
  using (bucket_id in ('quote-files', 'client-files'));
create policy staff_files_upload on storage.objects for insert to authenticated
  with check (bucket_id in ('quote-files', 'client-files'));
create policy admin_files_update on storage.objects for update to authenticated
  using (bucket_id in ('quote-files', 'client-files') and public.is_admin())
  with check (bucket_id in ('quote-files', 'client-files') and public.is_admin());
create policy admin_files_delete on storage.objects for delete to authenticated
  using (bucket_id in ('quote-files', 'client-files') and public.is_admin());

-- ------------------------------------------------------ emails never change
-- Through the API only full_name, edit_view and role can be updated (role is
-- still checked by guard_role_change). The policies decide whose row.
revoke update on public.profiles from anon, authenticated;
grant update (full_name, edit_view, role) on public.profiles to authenticated;

-- Supabase Auth runs as supabase_auth_admin, so this refuses email changes
-- from users and from the dashboard alike. Only the SQL editor (postgres) can
-- change one; update public.profiles.email to match when you do.
create function public.block_email_change() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user <> 'postgres'
     and (new.email is distinct from old.email
          or (new.email_change is distinct from old.email_change
              and coalesce(new.email_change, '') <> '')) then
    raise exception 'Email addresses cannot be changed.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create trigger users_block_email_change
  before update on auth.users
  for each row execute function public.block_email_change();

-- -------------------------------------------- no RPC calls when signed out
-- Postgres lets everyone (including anon) execute new functions. These two
-- are SECURITY DEFINER; signed-in staff still need them for the triggers.
revoke execute on function public.next_ref(uuid, text) from public, anon;
revoke execute on function public.assign_item_ref(uuid, text, text) from public, anon;
grant execute on function public.next_ref(uuid, text) to authenticated;
grant execute on function public.assign_item_ref(uuid, text, text) to authenticated;
revoke execute on function public.is_admin() from anon;
revoke execute on function public.start_quote(uuid, text, text) from public, anon;

-- ------------------------------------------- one extraction run per image
-- Claims an image for extraction atomically: true if this caller may run it,
-- null if it is already done or another run is working on it. A run that died
-- mid-way is reclaimable after 10 minutes (requests are capped at 5).
alter table public.extractions add column started_at timestamptz;

create function public.claim_extraction(p_image_id uuid, p_prompt_version text, p_model text)
returns boolean
language sql as $$
  insert into public.extractions as e (image_id, prompt_version, status, model, started_at)
  values (p_image_id, p_prompt_version, 'running', p_model, now())
  on conflict (image_id, prompt_version) do update
    set status = 'running', error = null, model = excluded.model, started_at = now()
    where e.status in ('pending', 'failed')
       or (e.status = 'running' and (e.started_at is null or e.started_at < now() - interval '10 minutes'))
  returning true
$$;
revoke execute on function public.claim_extraction(uuid, text, text) from public, anon;
grant execute on function public.claim_extraction(uuid, text, text) to authenticated;

-- ---------------------------------------------- never lose the last admin
-- Replaces the 0005 version. Demotions now take a lock first, so two admins
-- demoting each other at the same moment cannot both succeed.
create or replace function public.guard_role_change() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.role is distinct from old.role then
    if current_user in ('authenticated', 'anon') and not public.is_admin() then
      raise exception 'Only an administrator can change a role.'
        using errcode = 'insufficient_privilege';
    end if;

    if old.role = 'admin' then
      perform pg_advisory_xact_lock(hashtext('public.profiles last admin'));
      -- Runs after the lock with a fresh snapshot, so it sees a demotion that just committed.
      if not exists (select 1 from public.profiles where role = 'admin' and id <> old.id) then
        raise exception 'Cannot remove the last administrator.'
          using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end $$;
