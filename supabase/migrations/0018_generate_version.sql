-- Generate version (docs/adr/0006).
-- Run in the Supabase SQL editor after 0017.
--
--   * generate_version(): saves the next Version with its frozen quote JSON and
--     its items in one transaction, as the 0015 lock requires, and returns its id.
--     The JSON's reference gets " V<n>" appended here, where n is known.

create function public.generate_version(p_quote_id uuid, p_assembled jsonb, p_items jsonb)
returns uuid
language plpgsql set search_path = public as $$
declare
  n int;
  vid uuid;
begin
  -- Two clicks at once both pick the same n; unique (quote_id, version_no) rejects the second.
  select coalesce(max(version_no), 0) + 1 into n from public.quote_versions where quote_id = p_quote_id;

  insert into public.quote_versions (quote_id, version_no, assembled, created_by)
  values (p_quote_id, n,
          jsonb_set(p_assembled, '{reference}', to_jsonb((p_assembled ->> 'reference') || ' V' || n)),
          auth.uid())
  returning id into vid;

  insert into public.version_items (version_id, entity_id, kind, option_no)
  select vid, i.entity_id, i.kind, i.option_no
  from jsonb_to_recordset(p_items) as i(entity_id text, kind text, option_no int);

  return vid;
end $$;
-- Runs as the caller, so RLS on quote_versions and version_items still applies.
revoke execute on function public.generate_version(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.generate_version(uuid, jsonb, jsonb) to authenticated;
