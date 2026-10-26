-- TTD quoting app: migration 0014.
-- Run in the Supabase SQL editor after 0013.
--
-- A "running" extraction can be claimed again after 5 minutes instead of 10. Extraction runs
-- inside a request that the host stops after 300 s, so a run older than that is dead.
create or replace function public.claim_extraction(p_image_id uuid, p_prompt_version text, p_model text)
returns boolean
language sql as $$
  insert into public.extractions as e (image_id, prompt_version, status, model, started_at)
  values (p_image_id, p_prompt_version, 'running', p_model, now())
  on conflict (image_id) do update
    set status = 'running', error = null, prompt_version = excluded.prompt_version,
        model = excluded.model, started_at = now()
    where e.status in ('pending', 'failed')
       or (e.status = 'running' and (e.started_at is null or e.started_at < now() - interval '5 minutes'))
  returning true
$$;
