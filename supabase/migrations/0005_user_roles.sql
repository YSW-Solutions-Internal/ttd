-- User roles and invitation-only accounts.
--
-- Two roles: 'admin' and 'user' (the old 'consultant' value becomes 'user';
-- trips.consultant_id is a different thing and is left alone).
--
-- The rules, all enforced here in the database so they hold whatever the app
-- or the Supabase dashboard settings do:
--   1. No account exists unless an admin invited it. Every new auth user must
--      match an open row in public.invitations, which only admins can write;
--      anything else (public sign-up, magic-link sign-in, OAuth, the
--      dashboard's own Invite/Add user) is rejected.
--   2. The new account's role comes from that invitation, never from
--      anything the user can supply.
--   3. Only an admin can change a role, including promoting someone to admin.
--   4. The last remaining admin cannot be demoted.
--
-- AFTER RUNNING THIS: every existing account is now 'user'. Promote yourself
-- with the statement at the bottom of this file, or nobody can invite anyone.

-- ------------------------------------------------- rename 'consultant' -> 'user'
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles alter column role drop default;

update public.profiles set role = 'user' where role = 'consultant';

alter table public.profiles alter column role set default 'user';
alter table public.profiles
  add constraint profiles_role_check check (role in ('user', 'admin'));

-- ------------------------------------------------------------------ helpers
-- SECURITY DEFINER so it reads profiles without re-entering profiles' own
-- policies (a plain subquery there recurses, as the 0001 policy did).
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  )
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- -------------------------------------------------------------- invitations
create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (email = lower(email)),
  full_name   text,
  role        text not null default 'user' check (role in ('user', 'admin')),
  -- Null only for invitations written in the SQL editor (first admin).
  invited_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  -- Set when the auth user is created from this invitation.
  used_at     timestamptz,
  user_id     uuid references auth.users(id) on delete set null
);

-- At most one open invitation per address.
create unique index invitations_one_open_per_email
  on public.invitations (email) where used_at is null;

alter table public.invitations enable row level security;

-- Admins only, and an admin can only write invitations in their own name.
create policy invitations_admin_read on public.invitations for select to authenticated
  using (public.is_admin());
create policy invitations_admin_insert on public.invitations for insert to authenticated
  with check (public.is_admin() and invited_by = auth.uid() and used_at is null);
create policy invitations_admin_delete on public.invitations for delete to authenticated
  using (public.is_admin() and used_at is null);

-- ------------------------------------------- new accounts need an invitation
-- Replaces the 0001 version. Raising here aborts the insert into auth.users,
-- so Supabase refuses to create the account at all.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv public.invitations;
begin
  select * into inv
    from public.invitations
   where email = lower(new.email) and used_at is null
   for update;

  if inv.id is null then
    raise exception 'Accounts are by invitation only; % has not been invited.', new.email
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(inv.full_name, split_part(new.email, '@', 1)),
    inv.role
  );

  update public.invitations
     set used_at = now(), user_id = new.id
   where id = inv.id;

  return new;
end $$;

-- ------------------------------------------------- only admins change roles
-- A trigger rather than a policy check, so the rule reads exactly as stated:
-- compare the old role with the new one and refuse unless an admin is asking.
-- It applies to the API roles (signed-in and anonymous users). The service
-- role and the SQL editor are trusted, which is how the first admin is made.
create or replace function public.guard_role_change() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.role is distinct from old.role then
    if current_user in ('authenticated', 'anon') and not public.is_admin() then
      raise exception 'Only an administrator can change a role.'
        using errcode = 'insufficient_privilege';
    end if;

    if old.role = 'admin'
       and not exists (select 1 from public.profiles where role = 'admin' and id <> old.id) then
      raise exception 'Cannot remove the last administrator.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_guard_role
  before update of role on public.profiles
  for each row execute function public.guard_role_change();

-- ---------------------------------------------------------------------- RLS
-- Replaces the 0001 policy, whose subquery on public.profiles recursed. The
-- role is now protected by the trigger above, so this only has to say
-- "your own row".
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Admins may update anyone's profile (the trigger still checks role changes).
-- No insert or delete policy: profiles come only from handle_new_user.
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------- first admin
-- Existing project: run once with your own email.
--
--   update public.profiles set role = 'admin' where email = 'you@example.com';
--
-- Brand-new project with no accounts yet: write the invitation here, then add
-- the user from the Supabase dashboard (Authentication -> Users).
--
--   insert into public.invitations (email, role) values ('you@example.com', 'admin');
